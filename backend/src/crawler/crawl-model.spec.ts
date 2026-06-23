import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => prisma.$disconnect());

describe('crawler schema', () => {
  it('creates a source, run, failure, and a draft curated deal', async () => {
    const source = await prisma.crawlSource.create({
      data: { url: `https://example.test/${Date.now()}`, kind: 'restaurant' },
    });
    const run = await prisma.crawlRun.create({ data: { sourceId: source.id } });
    await prisma.crawlFailure.create({ data: { runId: run.id, reason: 'timeout' } });

    const category = await prisma.category.findFirstOrThrow();
    const deal = await prisma.deal.create({
      data: {
        externalId: `crawl-test-${Date.now()}`,
        title: 'Half-price tacos',
        merchant: 'Test Cantina',
        categoryId: category.id,
        status: 'draft',
        moderationStatus: 'pending',
        sourceTrust: 'editorial',
        confidenceScore: 82,
        crawlSourceId: source.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect(deal.confidenceScore).toBe(82);
    expect(deal.crawlSourceId).toBe(source.id);

    await prisma.deal.delete({ where: { id: deal.id } });
    await prisma.crawlSource.delete({ where: { id: source.id } }); // cascades run+failure
  });
});
