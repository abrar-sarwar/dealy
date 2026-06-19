import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Ingestion pipeline (e2e)', () => {
  let app: INestApplicationContext;
  let ingestion: IngestionService;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    ingestion = app.get(IngestionService);
    prisma = app.get(PrismaService);
    await prisma.deal.deleteMany({ where: { source: 'fixture' } });
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { source: 'fixture' } });
    await prisma.ingestionRun.deleteMany({
      where: { provider: { in: ['fixture', 'ticketmaster'] } },
    });
    await app.close();
  });

  it('ingests the fixture provider and records a run', async () => {
    const summary = await ingestion.run('fixture');
    expect(summary.status).toBe('succeeded');
    expect(summary.available).toBe(true);
    expect(summary.fetched).toBe(5);
    expect(summary.upserted).toBe(5);
    expect(summary.failed).toBe(0);

    const count = await prisma.deal.count({ where: { source: 'fixture' } });
    expect(count).toBe(5);

    const run = await prisma.ingestionRun.findUnique({ where: { id: summary.runId } });
    expect(run?.status).toBe('succeeded');
    expect(run?.upserted).toBe(5);
  });

  it('is idempotent on re-run (upsert by externalId, no duplicates)', async () => {
    await ingestion.run('fixture');
    const count = await prisma.deal.count({ where: { source: 'fixture' } });
    expect(count).toBe(5);
  });

  it('records an unavailable provider as failed (awaiting credentials)', async () => {
    const summary = await ingestion.run('ticketmaster');
    // No TICKETMASTER_API_KEY in tests → unavailable.
    expect(summary.available).toBe(false);
    expect(summary.status).toBe('failed');
    const run = await prisma.ingestionRun.findUnique({ where: { id: summary.runId } });
    expect(run?.error).toMatch(/credentials/);
  });

  it('throws on an unknown provider', async () => {
    await expect(ingestion.run('nope')).rejects.toThrow(/Unknown provider/);
  });

  it('expireDeals marks past-due published deals expired', async () => {
    const cat = await prisma.category.findFirst({ where: { slug: 'food' } });
    await prisma.deal.create({
      data: {
        externalId: 'expire-test-1',
        title: 'Expired Test',
        merchant: 'M',
        categoryId: cat!.id,
        expiresAt: new Date(Date.now() - 1000),
        status: 'published',
        source: 'fixture',
      },
    });
    const n = await ingestion.expireDeals();
    expect(n).toBeGreaterThanOrEqual(1);
    const d = await prisma.deal.findUnique({ where: { externalId: 'expire-test-1' } });
    expect(d?.status).toBe('expired');
  });
});
