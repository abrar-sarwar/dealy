import { DiscoveryRunnerService } from './discovery-runner.service';

const cfg = {
  gemini: { model: 'flash', reasoningModel: 'pro', escalationMaxConfidence: 60, escalationMinReliability: 80 },
  targetPaths: ['/deals', '/weekly-ad', '/coupons'],
};

function deps(over: any = {}) {
  const source = {
    id: 's1', url: 'https://shop.com/weekly-ad', dealUrl: null, targetPaths: [],
    sourceType: 'weekly_ad', merchantHint: 'Shop', defaultCategorySlug: 'groceries', zoneSlug: 'atlanta',
    reliabilityScore: 70, averageDealsFound: 2, lastSuccessAt: null, lastCrawledAt: null,
    crawlIntervalHours: 24, enabled: true, ...over.source,
  };
  return {
    source,
    prisma: {
      crawlSource: { findMany: jest.fn(async () => [source]), update: jest.fn(async () => source) },
      crawlRun: { create: jest.fn(async () => ({ id: 'run1' })), update: jest.fn(async () => ({})) },
      contentHash: { findUnique: jest.fn(async () => over.priorHash ?? null), upsert: jest.fn(async () => ({ id: 'h1' })) },
      regionalInventory: { findUnique: jest.fn(async () => ({ id: 'r1', regionSlug: 'atlanta' })) },
      dealCandidate: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({ id: 'c1' })) },
    },
    discovery: { evaluateRegion: jest.fn(async () => ({ trigger: true, reason: 'below_minimum_deals' })) },
    budget: { check: jest.fn(async () => over.budget ?? ({ allowed: true, remainingPages: 10 })) },
    firecrawl: { scrape: jest.fn(async () => ({ markdown: '20% off deli', url: source.url })) },
    gemini: {
      planCrawl: jest.fn(async () => over.plan ?? ({ crawl: true, reason: 'fresh', priority: 7 })),
      extractDeals: jest.fn(async () => ({ deals: [{ title: '20% off deli', merchant: 'Shop', category: 'groceries', discount: '20%', expiration: null, location: null, summary: 's', confidence: 90, verification_status: 'pending', verified: false }] })),
    },
    aiCache: { getOrGenerate: jest.fn(async (_p: any, gen: any) => ({ value: await gen(), cacheHit: false })) },
  };
}

function build(d: any) {
  return new DiscoveryRunnerService(d.prisma, d.discovery, d.budget, d.firecrawl, d.gemini, d.aiCache, cfg as never);
}

describe('DiscoveryRunnerService.runRegion', () => {
  it('skips entirely when the region does not need a refresh', async () => {
    const d = deps();
    d.discovery.evaluateRegion = jest.fn(async () => ({ trigger: false, reason: 'inventory_healthy' }));
    const out = await build(d).runRegion('atlanta');
    expect(out.skipped).toBe(true);
    expect(d.firecrawl.scrape).not.toHaveBeenCalled();
    expect(d.gemini.planCrawl).not.toHaveBeenCalled();
  });

  it('runs the full pipeline and persists a candidate', async () => {
    const d = deps();
    const out = await build(d).runRegion('atlanta');
    expect(d.budget.check).toHaveBeenCalledWith('s1', { sourceMayBeUnchanged: false }, expect.any(Date));
    expect(d.gemini.planCrawl).toHaveBeenCalledTimes(1);
    expect(d.firecrawl.scrape).toHaveBeenCalledWith({ url: 'https://shop.com/weekly-ad' });
    expect(d.gemini.extractDeals).toHaveBeenCalledTimes(1);
    expect(d.prisma.dealCandidate.create).toHaveBeenCalledTimes(1);
    expect(out.candidatesStored).toBe(1);
  });

  it('skips Gemini and marks the run unchanged when content hash is unchanged', async () => {
    const d = deps({ priorHash: { id: 'h1', processedAt: new Date('2026-06-20') } });
    const out = await build(d).runRegion('atlanta');
    expect(d.firecrawl.scrape).toHaveBeenCalledTimes(1);
    expect(d.gemini.extractDeals).not.toHaveBeenCalled();
    expect(out.geminiSkips).toBe(1);
    expect(d.prisma.crawlRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unchanged: true }) }));
  });

  it('passes sourceMayBeUnchanged=true to the budget when the source has a prior successful crawl', async () => {
    const d = deps({ source: { lastSuccessAt: new Date('2026-06-20T00:00:00Z') } });
    await build(d).runRegion('atlanta');
    expect(d.budget.check).toHaveBeenCalledWith('s1', { sourceMayBeUnchanged: true }, expect.any(Date));
  });

  it('does not scrape when Gemini declines the crawl', async () => {
    const d = deps({ plan: { crawl: false, reason: 'unlikely', priority: 1 } });
    await build(d).runRegion('atlanta');
    expect(d.firecrawl.scrape).not.toHaveBeenCalled();
  });

  it('does not call Gemini or scrape when the budget denies the source', async () => {
    const d = deps({ budget: { allowed: false, reason: 'source_page_cap', remainingPages: 0 } });
    await build(d).runRegion('atlanta');
    expect(d.gemini.planCrawl).not.toHaveBeenCalled();
    expect(d.firecrawl.scrape).not.toHaveBeenCalled();
  });

  it('escalates to Pro for low-confidence deals from reliable sources', async () => {
    const d = deps({ source: { reliabilityScore: 85 } });
    d.gemini.extractDeals = jest.fn()
      .mockResolvedValueOnce({ deals: [{ title: 't', merchant: 'Shop', category: 'groceries', discount: null, expiration: null, location: null, summary: 's', confidence: 40, verification_status: 'pending', verified: false }] })
      .mockResolvedValueOnce({ deals: [{ title: 't', merchant: 'Shop', category: 'groceries', discount: null, expiration: null, location: null, summary: 's', confidence: 88, verification_status: 'pending', verified: false }] });
    await build(d).runRegion('atlanta');
    expect(d.gemini.extractDeals).toHaveBeenCalledTimes(2);
    expect(d.gemini.extractDeals).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'pro' }));
  });
});
