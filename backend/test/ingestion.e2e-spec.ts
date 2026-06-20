import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { VerificationService } from '../src/ingestion/verification.service';
import { ProviderRegistry } from '../src/ingestion/provider-registry';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Ingestion pipeline (e2e)', () => {
  let app: INestApplicationContext;
  let ingestion: IngestionService;
  let verification: VerificationService;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    ingestion = app.get(IngestionService);
    verification = app.get(VerificationService);
    prisma = app.get(PrismaService);
    await prisma.deal.deleteMany({ where: { source: { in: ['fixture', 'editorial'] } } });
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { source: { in: ['fixture', 'editorial'] } } });
    await prisma.ingestionRun.deleteMany({
      where: { provider: { in: ['fixture', 'ticketmaster', 'editorial'] } },
    });
    await prisma.verificationRun.deleteMany({
      where: { provider: { in: ['fixture', 'editorial'] } },
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
    // Ticketmaster is gated on TICKETMASTER_API_KEY. When a real key is present
    // the events path is live (covered by the provider's own logic); we only
    // assert the awaiting-credentials pipeline behavior when the key is absent.
    const ticketmaster = app.get(ProviderRegistry).get('ticketmaster')!;
    if (ticketmaster.isAvailable()) {
      expect(ticketmaster.isAvailable()).toBe(true);
      return;
    }
    const summary = await ingestion.run('ticketmaster');
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

  it('lands ingested deals verified, with source provenance retained', async () => {
    await ingestion.run('fixture');
    const deal = await prisma.deal.findUnique({ where: { externalId: 'fixture-1' } });
    expect(deal?.verificationStatus).toBe('verified');
    expect(deal?.lastVerifiedAt).toBeTruthy();
    expect(deal?.source).toBe('fixture');
    expect(deal?.sourceUrl).toBe('fixture://deal/1');
    expect(deal?.providerAttribution).toBe('Dealy fixture data');
  });

  it('ingests the curated editorial provider (food/groceries)', async () => {
    const summary = await ingestion.run('editorial');
    expect(summary.status).toBe('succeeded');
    expect(summary.upserted).toBeGreaterThanOrEqual(20);
    const count = await prisma.deal.count({
      where: { source: 'editorial', verificationStatus: 'verified' },
    });
    expect(count).toBeGreaterThanOrEqual(20);
  });

  describe('daily re-verification', () => {
    it('retains a still-confirmed deal and refreshes lastVerifiedAt', async () => {
      await ingestion.run('fixture');
      // Backdate the confirmation so a refresh is observable.
      await prisma.deal.update({
        where: { externalId: 'fixture-1' },
        data: { lastVerifiedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      const before = await prisma.deal.findUnique({ where: { externalId: 'fixture-1' } });
      await verification.verifyProvider('fixture');
      const after = await prisma.deal.findUnique({ where: { externalId: 'fixture-1' } });
      expect(after?.verificationStatus).toBe('verified');
      expect(after?.status).toBe('published');
      expect(after!.lastVerifiedAt!.getTime()).toBeGreaterThan(before!.lastVerifiedAt!.getTime());
    });

    it('removes a source-invalidated deal from active feeds immediately', async () => {
      await ingestion.run('fixture');
      // Insert a fixture-sourced deal whose externalId the provider will not confirm.
      const cat = await prisma.category.findFirst({ where: { slug: 'food' } });
      await prisma.deal.create({
        data: {
          externalId: 'fixture-ghost',
          title: 'Ghost Deal',
          merchant: 'Nowhere',
          categoryId: cat!.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          status: 'published',
          source: 'fixture',
          verificationStatus: 'verified',
          lastVerifiedAt: new Date(),
        },
      });
      await verification.verifyProvider('fixture');
      const ghost = await prisma.deal.findUnique({ where: { externalId: 'fixture-ghost' } });
      expect(ghost?.verificationStatus).toBe('invalid');
      expect(ghost?.status).toBe('archived');
      // A real fixture deal alongside it stays verified — failures are per-deal.
      const real = await prisma.deal.findUnique({ where: { externalId: 'fixture-1' } });
      expect(real?.verificationStatus).toBe('verified');
    });

    it('isolates providers: one provider run does not touch another provider', async () => {
      await ingestion.run('fixture');
      await ingestion.run('editorial');
      const editorialBefore = await prisma.deal.findFirst({ where: { source: 'editorial' } });
      // Verify only the fixture provider.
      const summary = await verification.verifyProvider('fixture');
      expect(summary.provider).toBe('fixture');
      const editorialAfter = await prisma.deal.findUnique({
        where: { id: editorialBefore!.id },
      });
      expect(editorialAfter?.verificationStatus).toBe(editorialBefore?.verificationStatus);
    });
  });
});
