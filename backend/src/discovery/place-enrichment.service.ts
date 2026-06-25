import { Logger } from '@nestjs/common';
import type { AiCacheService } from './ai-cache.service';
import { RateLimiter } from './rate-limiter';
import {
  currentHash,
  mapEnrichment,
  ENRICHMENT_BATCH_SCHEMA,
  ENRICHMENT_SCHEMA_VERSION,
  FEED_SECTION_VOCAB,
  type PlaceCoreInputs,
  type PlaceEnrichmentFields,
  type RawPlaceEnrichment,
} from './place-enrichment.types';

/** The Place fields the enrichment reads + writes. Kept narrow so unit tests can
 *  supply a minimal Prisma double. */
export interface EnrichablePlace extends PlaceCoreInputs {
  id: string;
  regionSlug: string;
  enrichedAt: Date | null;
  enrichmentHash: string | null;
}

export interface EnrichmentLog {
  regionSlug: string;
  considered: number;
  enriched: number;
  skippedCached: number;
  failed: number;
  rateLimitedStops: number;
  completed: boolean;
}

export interface EnrichRegionOptions {
  max?: number;
}

/** Prisma surface this service needs. */
export interface EnrichmentPrisma {
  place: {
    findMany(args: unknown): Promise<EnrichablePlace[]>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

/** Gemini surface this service needs — a single structured-JSON generator. */
export interface EnrichmentGemini {
  generateJson<T>(request: { model: string; schema: unknown; prompt: string }): Promise<T>;
}

export interface EnrichmentConfig {
  model: string;
  ratePerMin: number;
  batchSize: number;
  maxRetries: number;
  enabled: boolean;
}

interface BatchResponse {
  enrichments: Array<RawPlaceEnrichment & { place_key?: string }>;
}

type BatchOutcome =
  | { byPlace: Map<string, { fields: PlaceEnrichmentFields; cacheHit: boolean }> }
  | 'stop';

/** A 429 / free-tier quota exhaustion — same detection used by the discovery
 *  runner. When seen past the retry budget we STOP the run safely (no throw). */
function isGeminiQuotaExhausted(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('429') &&
    (message.includes('RESOURCE_EXHAUSTED') ||
      message.includes('generate_content_free_tier_requests') ||
      message.includes('Quota exceeded'))
  );
}

function placeLine(p: EnrichablePlace): string {
  return [
    `place_key=${p.id}`,
    `name="${p.name}"`,
    `category=${p.categorySlug}`,
    `price_level=${p.priceLevel ?? 'unknown'}`,
    `rating=${p.rating ?? 'unknown'}`,
    `reviews=${p.userRatingsTotal ?? 'unknown'}`,
    `address="${p.address ?? ''}"`,
  ].join(' ');
}

function buildPrompt(regionSlug: string, places: EnrichablePlace[]): string {
  return (
    'You generate honest feed metadata for local businesses near a college region. ' +
    'Return ONLY JSON matching the schema — no prose. For EACH place below, infer the ' +
    'fields. Do NOT fabricate facts (hours, menus, prices you were not given); the ' +
    'scores are your judgement from the signals provided (category, price level, rating, ' +
    "review count). Echo each place's place_key EXACTLY so fields map back correctly.\n" +
    'Field guidance:\n' +
    '- price_bucket: one of "$","$$","$$$","$$$$" reflecting price_level (0/1→$, 2→$$, 3→$$$, 4→$$$$); null if unknown.\n' +
    '- affordability_score (0..1): 1 = very cheap, 0 = expensive.\n' +
    '- cheap_eats_score (0..1): only meaningful for food; high = great cheap food value.\n' +
    '- student_value_score (0..1): how well this fits a student budget/lifestyle.\n' +
    '- hidden_gem_score (0..1): high when rating is good but review count is modest (under-the-radar).\n' +
    '- deal_likelihood_score (0..1): likelihood this place runs offers/specials worth checking.\n' +
    '- confidence_label: "low"|"medium"|"high" — your confidence given how much signal you had.\n' +
    '- best_for: short phrase (e.g. "quick lunch between classes"); vibe_tags / category_tags: short tags.\n' +
    '- why_recommended: one honest sentence.\n' +
    `- feed_section_candidates: subset of [${FEED_SECTION_VOCAB.join(', ')}] that genuinely fit.\n` +
    `Region: ${regionSlug}\n\nPLACES:\n` +
    places.map(placeLine).join('\n')
  );
}

/**
 * P3 — enriches discovered Places with Gemini-generated feed metadata so they are
 * feed-ready even when scraped deals are sparse. Free-tier safe: paced to
 * RATE_PER_MIN, batched, AiCache-keyed on the place's enrichmentHash (an
 * unchanged place is never re-sent), and resumable (each batch persists
 * immediately; a re-run skips enriched/cached places and continues).
 */
export class PlaceEnrichmentService {
  private readonly logger = new Logger(PlaceEnrichmentService.name);

  constructor(
    private readonly prisma: EnrichmentPrisma,
    private readonly gemini: EnrichmentGemini,
    private readonly aiCache: Pick<AiCacheService, 'getOrGenerate'>,
    private readonly config: EnrichmentConfig,
  ) {}

  async enrichRegion(regionSlug: string, opts: EnrichRegionOptions = {}): Promise<EnrichmentLog> {
    const log: EnrichmentLog = {
      regionSlug,
      considered: 0,
      enriched: 0,
      skippedCached: 0,
      failed: 0,
      rateLimitedStops: 0,
      completed: false,
    };

    if (!this.config.enabled) {
      this.logger.warn(`place-enrichment ${regionSlug}: AI disabled — nothing to do`);
      log.completed = true;
      this.logger.log(`place-enrichment ${regionSlug}: ${JSON.stringify(log)}`);
      return log;
    }

    const all = (await this.prisma.place.findMany({
      where: { regionSlug },
      orderBy: { discoveredAt: 'asc' },
    })) as EnrichablePlace[];

    // Needs enrichment: never enriched, OR core data changed (stale hash).
    const pending = all.filter((p) => p.enrichedAt == null || p.enrichmentHash !== currentHash(p));
    const capped = opts.max != null && opts.max >= 0 ? pending.slice(0, opts.max) : pending;
    log.considered = capped.length;

    const limiter = new RateLimiter(this.config.ratePerMin);

    for (let i = 0; i < capped.length; i += this.config.batchSize) {
      const batch = capped.slice(i, i + this.config.batchSize);
      let result: BatchOutcome;
      try {
        result = await this.processBatch(regionSlug, batch, limiter);
      } catch (err) {
        // Non-quota error on a batch: count it, keep going (resumable).
        log.failed += batch.length;
        this.logger.error(
          `place-enrichment ${regionSlug}: batch failed — ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }

      if (result === 'stop') {
        log.rateLimitedStops += 1;
        this.logger.warn(
          `place-enrichment ${regionSlug}: Gemini quota exhausted — stopping safely. ` +
            `${log.enriched} enriched persisted; a re-run resumes.`,
        );
        this.logger.log(`place-enrichment ${regionSlug}: ${JSON.stringify(log)}`);
        return log; // completed stays false
      }

      for (const p of batch) {
        const entry = result.byPlace.get(p.id);
        if (!entry) {
          log.failed += 1;
          continue;
        }
        await this.persist(p, entry.fields);
        log.enriched += 1;
        if (entry.cacheHit) log.skippedCached += 1;
      }
    }

    log.completed = true;
    this.logger.log(`place-enrichment ${regionSlug}: ${JSON.stringify(log)}`);
    return log;
  }

  /** Enrich one batch. Each place is resolved through AiCache keyed on its
   *  enrichmentHash, so an unchanged place is a pure cache hit (no Gemini call).
   *  On the first cache MISS in the batch we make ONE batched Gemini call (paced
   *  + 429-retried) covering every miss and memoize its results; subsequent
   *  misses in the same batch read the memo (no extra Gemini call). Returns
   *  'stop' when quota is exhausted past the retry budget. */
  private async processBatch(
    regionSlug: string,
    batch: EnrichablePlace[],
    limiter: RateLimiter,
  ): Promise<
    { byPlace: Map<string, { fields: PlaceEnrichmentFields; cacheHit: boolean }> } | 'stop'
  > {
    const byPlace = new Map<string, { fields: PlaceEnrichmentFields; cacheHit: boolean }>();

    // Lazily-run, memoized batch Gemini call shared by all misses in this batch.
    let batchPromise: Promise<Map<string, RawPlaceEnrichment>> | null = null;
    let stopped = false;
    const runBatchOnce = (): Promise<Map<string, RawPlaceEnrichment>> => {
      if (!batchPromise) {
        batchPromise = this.callGeminiWithRetry(regionSlug, batch, limiter).then((response) => {
          const byKey = new Map<string, RawPlaceEnrichment>();
          for (const e of response.enrichments ?? []) {
            if (typeof e.place_key === 'string') byKey.set(e.place_key, e);
          }
          return byKey;
        });
      }
      return batchPromise;
    };

    for (const p of batch) {
      if (stopped) break;
      const hash = currentHash(p);
      try {
        const { value, cacheHit } = await this.aiCache.getOrGenerate<PlaceEnrichmentFields>(
          {
            task: 'place_enrichment',
            model: this.config.model,
            schemaVersion: ENRICHMENT_SCHEMA_VERSION,
            prompt: hash, // cacheKey derives from this — hash is the unit of identity
          },
          async () => {
            const raw = await runBatchOnce();
            const r = raw.get(p.id);
            if (!r) throw new Error(`Gemini batch missing enrichment for place ${p.id}`);
            return mapEnrichment(r);
          },
        );
        byPlace.set(p.id, { fields: value, cacheHit });
      } catch (err) {
        if (isGeminiQuotaExhausted(err)) {
          stopped = true;
          break;
        }
        // A per-place miss in the response (or other generate error): skip it;
        // the caller counts it as failed. Do not abort the whole batch.
        this.logger.warn(
          `place-enrichment ${regionSlug}: place ${p.id} not enriched — ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (stopped) return 'stop';
    return { byPlace };
  }

  /** Paced Gemini call with exponential backoff on 429 up to maxRetries; rethrows
   *  the quota error past the budget so the caller can stop safely. */
  private async callGeminiWithRetry(
    regionSlug: string,
    places: EnrichablePlace[],
    limiter: RateLimiter,
  ): Promise<BatchResponse> {
    const prompt = buildPrompt(regionSlug, places);
    let attempt = 0;
    for (;;) {
      await limiter.acquire(); // pace: <= RATE_PER_MIN calls/min
      try {
        return await this.gemini.generateJson<BatchResponse>({
          model: this.config.model,
          schema: ENRICHMENT_BATCH_SCHEMA,
          prompt,
        });
      } catch (err) {
        if (isGeminiQuotaExhausted(err) && attempt < this.config.maxRetries) {
          attempt += 1;
          const wait = 1000 * 2 ** (attempt - 1);
          this.logger.warn(
            `place-enrichment ${regionSlug}: 429 — backoff ${wait}ms (retry ${attempt}/${this.config.maxRetries})`,
          );
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw err;
      }
    }
  }

  private async persist(p: EnrichablePlace, fields: PlaceEnrichmentFields): Promise<void> {
    await this.prisma.place.update({
      where: { id: p.id },
      data: {
        ...fields,
        enrichedAt: new Date(),
        enrichmentHash: currentHash(p),
      },
    });
  }
}
