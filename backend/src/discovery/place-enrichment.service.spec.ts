import {
  PlaceEnrichmentService,
  type EnrichablePlace,
  type EnrichmentConfig,
  type EnrichmentGemini,
} from './place-enrichment.service';
import { currentHash } from './place-enrichment.types';

function place(over: Partial<EnrichablePlace> = {}): EnrichablePlace {
  const id = over.id ?? 'p1';
  return {
    id,
    // Distinct name per id so each place has a distinct currentHash (cache key).
    name: over.name ?? `Joe Coffee ${id}`,
    categorySlug: over.categorySlug ?? 'food',
    priceLevel: over.priceLevel ?? 2,
    rating: over.rating ?? 4.5,
    userRatingsTotal: over.userRatingsTotal ?? 200,
    address: over.address ?? '1 Edgewood Ave',
    regionSlug: over.regionSlug ?? 'gsu',
    enrichedAt: over.enrichedAt ?? null,
    enrichmentHash: over.enrichmentHash ?? null,
    budgetTip: 'budgetTip' in over ? over.budgetTip! : null,
  };
}

/** In-memory AiCache that mirrors getOrGenerate: caches by the prompt key (which
 *  the service sets to the place's enrichmentHash). */
function makeAiCache() {
  const store = new Map<string, unknown>();
  const getOrGenerate = jest.fn(
    async (
      params: { task: string; model: string; schemaVersion: string; prompt: string },
      generate: () => Promise<unknown>,
    ) => {
      const key = `${params.task}:${params.model}:${params.schemaVersion}:${params.prompt}`;
      if (store.has(key)) return { value: store.get(key), cacheHit: true };
      const value = await generate();
      store.set(key, value);
      return { value, cacheHit: false };
    },
  );
  // Simulate a schemaVersion bump: same backing store, but every lookup is forced
  // under a different version → cache miss → regeneration.
  const withSchemaVersion = (version: string) => ({
    getOrGenerate: jest.fn(
      async (
        params: { task: string; model: string; schemaVersion: string; prompt: string },
        generate: () => Promise<unknown>,
      ) => getOrGenerate({ ...params, schemaVersion: version }, generate),
    ),
  });
  return { getOrGenerate, store, withSchemaVersion };
}

function makePrisma(rows: EnrichablePlace[]) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    updates,
    place: {
      findMany: jest.fn(async () => rows.map((r) => ({ ...byId.get(r.id)! }))),
      update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: args.where.id, data: args.data });
        const row = byId.get(args.where.id)!;
        Object.assign(row, args.data);
        return row;
      }),
    },
  };
}

function geminiReturning(forKeys: string[]): EnrichmentGemini & { generateJson: jest.Mock } {
  const generateJson = jest.fn<Promise<unknown>, unknown[]>(async () => ({
    enrichments: forKeys.map((k) => ({
      place_key: k,
      price_bucket: '$$',
      student_value_score: 0.8,
      affordability_score: 0.7,
      best_for: 'quick lunch',
      vibe_tags: ['cozy'],
      category_tags: ['coffee'],
      why_recommended: 'Good value.',
      confidence_label: 'high',
      deal_likelihood_score: 0.3,
      hidden_gem_score: 0.2,
      cheap_eats_score: 0.9,
      feed_section_candidates: ['cheap_eats'],
      budget_tip: 'For under $8, get the drip + a day-old pastry.',
    })),
  }));
  return { generateJson } as unknown as EnrichmentGemini & { generateJson: jest.Mock };
}

const config: EnrichmentConfig = {
  model: 'gemini-2.5-flash',
  ratePerMin: 1000, // fast for tests; pacing tested separately
  batchSize: 8,
  maxRetries: 3,
  enabled: true,
};

describe('PlaceEnrichmentService.enrichRegion', () => {
  it('enriches pending places and persists fields + enrichedAt + hash', async () => {
    const rows = [place({ id: 'p1' }), place({ id: 'p2', name: 'Tea House' })];
    const prisma = makePrisma(rows);
    const cache = makeAiCache();
    const gemini = geminiReturning(['p1', 'p2']);
    const svc = new PlaceEnrichmentService(prisma as never, gemini, cache as never, config);

    const log = await svc.enrichRegion('gsu');

    expect(log.considered).toBe(2);
    expect(log.enriched).toBe(2);
    expect(log.failed).toBe(0);
    expect(log.completed).toBe(true);
    expect(gemini.generateJson).toHaveBeenCalledTimes(1); // one batch
    // Persisted mapped fields + bookkeeping.
    const u = prisma.updates.find((x) => x.id === 'p1')!;
    expect(u.data.cheapEatsScore).toBe(0.9);
    expect(u.data.priceBucket).toBe('$$');
    expect(u.data.budgetTip).toBe('For under $8, get the drip + a day-old pastry.');
    expect(u.data.enrichedAt).toBeInstanceOf(Date);
    expect(u.data.enrichmentHash).toBe(currentHash(rows[0]));
  });

  it('bumping the enrichment schemaVersion re-generates (cache miss) so already-enriched places get a budget tip', async () => {
    const p = place({ id: 'p1' });
    const cache = makeAiCache();
    const gemini = geminiReturning(['p1']);

    // First run under the CURRENT schemaVersion populates the cache + persists.
    const prisma1 = makePrisma([p]);
    const svc1 = new PlaceEnrichmentService(prisma1 as never, gemini, cache as never, config);
    await svc1.enrichRegion('gsu');
    expect(gemini.generateJson).toHaveBeenCalledTimes(1);

    // Same hash but the schemaVersion the cache keys on has changed → cache MISS,
    // so Gemini is called again and a fresh (budget-tip-bearing) value is regenerated.
    const bumped = cache.withSchemaVersion('vNEXT');
    const prisma2 = makePrisma([place({ id: 'p1' })]);
    const svc2 = new PlaceEnrichmentService(prisma2 as never, gemini, bumped as never, config);
    await svc2.enrichRegion('gsu');

    expect(gemini.generateJson).toHaveBeenCalledTimes(2); // regenerated under the new version
    const u = prisma2.updates.find((x) => x.id === 'p1')!;
    expect(u.data.budgetTip).toBe('For under $8, get the drip + a day-old pastry.');
  });

  it('skips already-enriched, unchanged places that already have a budget tip (resume): no Gemini call', async () => {
    const p = place({ id: 'p1', budgetTip: 'Get the $5 combo.' });
    const enriched = { ...p, enrichedAt: new Date(), enrichmentHash: currentHash(p) };
    const prisma = makePrisma([enriched]);
    const cache = makeAiCache();
    const gemini = geminiReturning(['p1']);
    const svc = new PlaceEnrichmentService(prisma as never, gemini, cache as never, config);

    const log = await svc.enrichRegion('gsu');

    expect(log.considered).toBe(0);
    expect(log.enriched).toBe(0);
    expect(gemini.generateJson).not.toHaveBeenCalled();
    expect(prisma.place.update).not.toHaveBeenCalled();
  });

  it('backfills an already-enriched place that is MISSING a budget tip (re-queues it)', async () => {
    // Enriched against the CURRENT hash but predates budget tips → budgetTip null.
    const p = place({ id: 'p1' });
    const enriched = { ...p, enrichedAt: new Date(), enrichmentHash: currentHash(p) };
    const prisma = makePrisma([enriched]);
    const cache = makeAiCache();
    const gemini = geminiReturning(['p1']);
    const svc = new PlaceEnrichmentService(prisma as never, gemini, cache as never, config);

    const log = await svc.enrichRegion('gsu');

    expect(log.considered).toBe(1);
    expect(log.enriched).toBe(1);
    const u = prisma.updates.find((x) => x.id === 'p1')!;
    expect(u.data.budgetTip).toBe('For under $8, get the drip + a day-old pastry.');
  });

  it('re-enriches a STALE place whose core data changed', async () => {
    const p = place({ id: 'p1' });
    // enriched against an OLD hash (price was different) → stale.
    const stale = { ...p, enrichedAt: new Date(), enrichmentHash: 'old-hash' };
    const prisma = makePrisma([stale]);
    const cache = makeAiCache();
    const gemini = geminiReturning(['p1']);
    const svc = new PlaceEnrichmentService(prisma as never, gemini, cache as never, config);

    const log = await svc.enrichRegion('gsu');
    expect(log.considered).toBe(1);
    expect(log.enriched).toBe(1);
    expect(gemini.generateJson).toHaveBeenCalledTimes(1);
  });

  it('AiCache: a second run with the same hash is a cache hit (no Gemini call)', async () => {
    const p = place({ id: 'p1' });
    const prisma = makePrisma([p]);
    const cache = makeAiCache();
    const gemini = geminiReturning(['p1']);
    const svc = new PlaceEnrichmentService(prisma as never, gemini, cache as never, config);

    await svc.enrichRegion('gsu'); // populates cache + persists
    expect(gemini.generateJson).toHaveBeenCalledTimes(1);

    // Simulate a fresh DB row (recreated) but SAME core inputs → same hash.
    const prisma2 = makePrisma([place({ id: 'p1' })]);
    const svc2 = new PlaceEnrichmentService(prisma2 as never, gemini, cache as never, config);
    const log2 = await svc2.enrichRegion('gsu');

    expect(gemini.generateJson).toHaveBeenCalledTimes(1); // STILL 1 — served from cache
    expect(log2.enriched).toBe(1);
    expect(log2.skippedCached).toBe(1);
  });

  it('caps places per run with max', async () => {
    const rows = [place({ id: 'p1' }), place({ id: 'p2' }), place({ id: 'p3' })];
    const prisma = makePrisma(rows);
    const cache = makeAiCache();
    const gemini = geminiReturning(['p1', 'p2', 'p3']);
    const svc = new PlaceEnrichmentService(prisma as never, gemini, cache as never, config);

    const log = await svc.enrichRegion('gsu', { max: 2 });
    expect(log.considered).toBe(2);
    expect(log.enriched).toBe(2);
  });

  it('on quota exhaustion stops safely (no throw); enriched places persist; re-run resumes', async () => {
    const rows = [
      place({ id: 'p1' }),
      place({ id: 'p2' }),
      place({ id: 'p3' }),
      place({ id: 'p4' }),
    ];
    const prisma = makePrisma(rows);
    const cache = makeAiCache();

    // batchSize 2 → batch1 (p1,p2) succeeds, batch2 (p3,p4) hits quota.
    const quotaCfg: EnrichmentConfig = { ...config, batchSize: 2, maxRetries: 0 };
    let call = 0;
    const generateJson = jest.fn<Promise<unknown>, unknown[]>(async () => {
      call += 1;
      if (call === 1) {
        return {
          enrichments: ['p1', 'p2'].map((k) => ({
            place_key: k,
            price_bucket: '$$',
            student_value_score: 0.5,
            affordability_score: 0.5,
            best_for: 'x',
            vibe_tags: [],
            category_tags: [],
            why_recommended: 'x',
            confidence_label: 'medium',
            deal_likelihood_score: 0.5,
            hidden_gem_score: 0.5,
            cheap_eats_score: 0.5,
            feed_section_candidates: [],
            budget_tip: 'Split a combo to save.',
          })),
        };
      }
      throw new Error(
        'Gemini request failed: 429 {"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}',
      );
    });
    const gemini = { generateJson } as unknown as EnrichmentGemini & { generateJson: jest.Mock };
    const svc = new PlaceEnrichmentService(prisma as never, gemini, cache as never, quotaCfg);

    const log = await svc.enrichRegion('gsu');
    expect(log.rateLimitedStops).toBe(1);
    expect(log.completed).toBe(false);
    expect(log.enriched).toBe(2); // p1,p2 persisted before the stop
    expect(prisma.updates.map((u) => u.id).sort()).toEqual(['p1', 'p2']);

    // Re-run resumes: p1,p2 cached, only p3,p4 attempted again (now succeeding).
    const gemini2 = geminiReturning(['p3', 'p4']);
    const svc2 = new PlaceEnrichmentService(prisma as never, gemini2, cache as never, quotaCfg);
    const log2 = await svc2.enrichRegion('gsu');
    expect(log2.considered).toBe(2); // only p3,p4 still pending
    expect(log2.enriched).toBe(2);
    expect(log2.completed).toBe(true);
  });

  it('does nothing (completed) when AI is disabled', async () => {
    const prisma = makePrisma([place()]);
    const cache = makeAiCache();
    const gemini = geminiReturning(['p1']);
    const svc = new PlaceEnrichmentService(prisma as never, gemini, cache as never, {
      ...config,
      enabled: false,
    });
    const log = await svc.enrichRegion('gsu');
    expect(log.completed).toBe(true);
    expect(log.considered).toBe(0);
    expect(gemini.generateJson).not.toHaveBeenCalled();
  });
});
