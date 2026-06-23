// src/crawler/crawler.service.spec.ts
import { CrawlerService } from './crawler.service';
import { StructuredExtractor } from './extractors/structured-extractor';
import { LlmExtractor } from './extractors/llm-extractor';

const HTML = `<html><head><script type="application/ld+json">
{"@type":"Restaurant","name":"Taco Spot","address":"1 Peachtree St, Atlanta, GA",
 "makesOffer":{"@type":"Offer","name":"$5 Margaritas","price":"5.00","validThrough":"2030-01-01"}}
</script></head></html>`;

function makeService(over: Partial<any> = {}) {
  const created: any[] = [];
  const prisma = {
    crawlSource: { findUniqueOrThrow: async () => ({ id: 's1', url: 'https://x.test', kind: 'restaurant', defaultCategorySlug: 'food', merchantHint: null, enabled: true }), update: async () => ({}) },
    crawlRun: { create: async () => ({ id: 'r1' }), update: async () => ({}) },
    crawlFailure: { create: async () => ({}) },
    category: { findMany: async () => [{ id: 'cat-food', slug: 'food' }] },
    deal: {
      findFirst: async () => null,
      findUnique: async () => null,
      upsert: async ({ create }: any) => { created.push(create); return { id: `deal-${created.length}` }; },
    },
    ...over.prisma,
  };
  const fetcher = { fetchPage: async () => HTML };
  const geocoder = { geocode: async () => ({ latitude: 33.75, longitude: -84.39, confidence: 0.9 }) };
  const config = { get: () => undefined };
  const search = { upsertDeals: async () => {} };
  const service = new CrawlerService(
    prisma as any, fetcher as any, new StructuredExtractor(),
    new LlmExtractor({}), geocoder as any, config as any, search as any,
  );
  return { service, created };
}

describe('CrawlerService', () => {
  it('crawls → extracts → geocodes → queues a draft pending curated deal', async () => {
    const { service, created } = makeService();
    const summary = await service.runSource('s1');
    expect(summary.status).toBe('succeeded');
    expect(summary.queued).toBe(1);
    expect(created[0]).toMatchObject({
      status: 'draft', moderationStatus: 'pending', sourceTrust: 'editorial', latitude: 33.75,
    });
    expect(created[0].confidenceScore).toBeGreaterThan(0);
  });

  it('auto-publishes when confidence ≥ threshold and kind is allowlisted', async () => {
    const { service, created } = makeService({});
    (service as any).config = { get: (k: string) =>
      k === 'CRAWLER_AUTOPUBLISH_THRESHOLD' ? 50 : k === 'CRAWLER_AUTOPUBLISH_KINDS' ? 'restaurant' : undefined };
    const summary = await service.runSource('s1');
    expect(summary.autoPublished).toBe(1);
    expect(created[0]).toMatchObject({ status: 'published', moderationStatus: 'approved' });
  });

  it('never auto-publishes a low-confidence geocode', async () => {
    const { service, created } = makeService({});
    (service as any).geocoder = { geocode: async () => ({ latitude: 1, longitude: 1, confidence: 0.1 }) };
    (service as any).config = { get: (k: string) =>
      k === 'CRAWLER_AUTOPUBLISH_THRESHOLD' ? 1 : k === 'CRAWLER_AUTOPUBLISH_KINDS' ? 'restaurant' : undefined };
    const summary = await service.runSource('s1');
    expect(summary.autoPublished).toBe(0);
    expect(created[0]).toMatchObject({ status: 'draft', moderationStatus: 'pending' });
  });
});
