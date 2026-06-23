import { Test } from '@nestjs/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { VerificationService } from '../src/ingestion/verification.service';
import { TicketmasterProvider } from '../src/ingestion/providers/ticketmaster.provider';
import type {
  DealProvider,
  NormalizedDeal,
  VerificationResult,
} from '../src/ingestion/normalized-deal';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Controllable AUTHORITATIVE provider standing in for a real source (e.g.
 * Ticketmaster) without network calls — so trust + re-verification behavior can
 * be exercised deterministically.
 */
class FakeAuthoritative implements DealProvider {
  readonly name = 'ticketmaster';
  readonly trust = 'authoritative' as const;
  available = true;
  fetchResult: NormalizedDeal[] = [];
  verifyResult: VerificationResult = { status: 'confirmed' };
  isAvailable() {
    return this.available;
  }
  async fetch() {
    return this.fetchResult;
  }
  async verify(): Promise<VerificationResult> {
    return this.verifyResult;
  }
}

function authoritativeDeal(over: Partial<NormalizedDeal> = {}): NormalizedDeal {
  return {
    externalId: 'tm-1',
    title: 'State Farm Arena Event',
    merchant: 'State Farm Arena',
    categorySlug: 'entertainment',
    shortDescription: 's',
    detailedDescription: 'd',
    terms: 't',
    currentPriceMinor: 4500n,
    originalPriceMinor: 6000n,
    currency: 'USD',
    isOnline: false,
    isStudentOnly: false,
    couponCode: null,
    destinationUrl: 'https://www.ticketmaster.com/event/tm-1',
    latitude: 33.757,
    longitude: -84.396,
    locationTags: ['atlanta'],
    dealScore: 65,
    visualSeed: 1,
    startAt: null,
    expiresAt: new Date(Date.now() + 14 * 86_400_000),
    sourceUrl: 'https://www.ticketmaster.com/event/tm-1',
    providerAttribution: 'Powered by Ticketmaster',
    ...over,
  };
}

describe('Ingestion + trust + re-verification (e2e)', () => {
  let app: INestApplicationContext;
  let ingestion: IngestionService;
  let verification: VerificationService;
  let prisma: PrismaService;
  let fakeTm: FakeAuthoritative;

  const cleanup = () =>
    prisma.deal.deleteMany({ where: { source: { in: ['fixture', 'editorial', 'ticketmaster'] } } });

  beforeAll(async () => {
    fakeTm = new FakeAuthoritative();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TicketmasterProvider)
      .useValue(fakeTm)
      .compile();
    await moduleRef.init();
    app = moduleRef;
    ingestion = app.get(IngestionService);
    verification = app.get(VerificationService);
    prisma = app.get(PrismaService);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.ingestionRun.deleteMany({
      where: { provider: { in: ['fixture', 'ticketmaster', 'editorial'] } },
    });
    await prisma.verificationRun.deleteMany({
      where: { provider: { in: ['fixture', 'ticketmaster', 'editorial'] } },
    });
    await app.close();
  });

  // ---- Ingestion basics ----

  it('ingests the fixture provider and records a run', async () => {
    const summary = await ingestion.run('fixture');
    expect(summary.status).toBe('succeeded');
    expect(summary.fetched).toBe(5);
    expect(summary.upserted).toBe(5);
    const run = await prisma.ingestionRun.findUnique({ where: { id: summary.runId } });
    expect(run?.status).toBe('succeeded');
  });

  it('is idempotent on re-run (no duplicates)', async () => {
    await ingestion.run('fixture');
    expect(await prisma.deal.count({ where: { source: 'fixture' } })).toBe(5);
  });

  it('throws on an unknown provider', async () => {
    await expect(ingestion.run('nope')).rejects.toThrow(/Unknown provider/);
  });

  // ---- Trust classification (R1) ----

  it('ingests fixture inventory as NON-authoritative and never verified', async () => {
    await ingestion.run('fixture');
    const deal = await prisma.deal.findUnique({ where: { externalId: 'fixture-1' } });
    expect(deal?.sourceTrust).toBe('fixture');
    expect(deal?.verificationStatus).toBe('pending');
    expect(deal?.lastVerifiedAt).toBeNull();
    // Provenance still retained.
    expect(deal?.sourceUrl).toBe('fixture://deal/1');
  });

  it('ingests editorial inventory as editorial trust and never verified', async () => {
    const summary = await ingestion.run('editorial');
    expect(summary.upserted).toBeGreaterThanOrEqual(20);
    const verified = await prisma.deal.count({
      where: { source: 'editorial', verificationStatus: 'verified' },
    });
    expect(verified).toBe(0);
    const sample = await prisma.deal.findFirst({ where: { source: 'editorial' } });
    expect(sample?.sourceTrust).toBe('editorial');
    expect(sample?.verificationStatus).toBe('pending');
  });

  it('ingests authoritative inventory as verified with authoritative trust', async () => {
    fakeTm.fetchResult = [authoritativeDeal()];
    const summary = await ingestion.run('ticketmaster');
    expect(summary.status).toBe('succeeded');
    const deal = await prisma.deal.findUnique({ where: { externalId: 'tm-1' } });
    expect(deal?.sourceTrust).toBe('authoritative');
    expect(deal?.verificationStatus).toBe('verified');
    expect(deal?.lastVerifiedAt).toBeTruthy();
  });

  // ---- Sliding expiration (R2) ----

  it('does not slide expiration on re-ingestion of the same record', async () => {
    await ingestion.run('editorial');
    const first = await prisma.deal.findFirst({ where: { source: 'editorial' } });
    // A later re-ingest (the editorial provider computes a fresh relative expiry)
    // must NOT move the stored expiration forward.
    await new Promise((r) => setTimeout(r, 5));
    await ingestion.run('editorial');
    const second = await prisma.deal.findUnique({ where: { id: first!.id } });
    expect(second!.expiresAt.getTime()).toBe(first!.expiresAt.getTime());
  });

  // ---- Daily re-verification (authoritative only) ----

  describe('re-verification', () => {
    beforeEach(async () => {
      fakeTm.fetchResult = [authoritativeDeal()];
      fakeTm.verifyResult = { status: 'confirmed' };
      await ingestion.run('ticketmaster');
    });

    it('retains a still-confirmed deal and refreshes lastVerifiedAt', async () => {
      await prisma.deal.update({
        where: { externalId: 'tm-1' },
        data: { lastVerifiedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      const before = await prisma.deal.findUnique({ where: { externalId: 'tm-1' } });
      await verification.verifyProvider('ticketmaster');
      const after = await prisma.deal.findUnique({ where: { externalId: 'tm-1' } });
      expect(after?.verificationStatus).toBe('verified');
      expect(after!.lastVerifiedAt!.getTime()).toBeGreaterThan(before!.lastVerifiedAt!.getTime());
    });

    it('removes a source-invalidated deal from active feeds immediately', async () => {
      fakeTm.verifyResult = { status: 'invalid', reason: 'event gone' };
      await verification.verifyProvider('ticketmaster');
      const d = await prisma.deal.findUnique({ where: { externalId: 'tm-1' } });
      expect(d?.verificationStatus).toBe('invalid');
      expect(d?.status).toBe('archived');
    });

    it('expires a source-expired deal immediately', async () => {
      fakeTm.verifyResult = { status: 'expired' };
      await verification.verifyProvider('ticketmaster');
      const d = await prisma.deal.findUnique({ where: { externalId: 'tm-1' } });
      expect(d?.verificationStatus).toBe('expired');
      expect(d?.status).toBe('expired');
    });

    it('persists a provider-refreshed future expiration on confirmation (R6)', async () => {
      const refreshed = new Date(Date.now() + 30 * 86_400_000);
      fakeTm.verifyResult = { status: 'confirmed', expiresAt: refreshed };
      await verification.verifyProvider('ticketmaster');
      const d = await prisma.deal.findUnique({ where: { externalId: 'tm-1' } });
      expect(d!.expiresAt.getTime()).toBe(refreshed.getTime());
    });

    it('does not change expiration on an unreachable outcome', async () => {
      const before = await prisma.deal.findUnique({ where: { externalId: 'tm-1' } });
      fakeTm.verifyResult = {
        status: 'unreachable',
        expiresAt: new Date(Date.now() + 99 * 86_400_000),
      };
      await verification.verifyProvider('ticketmaster');
      const after = await prisma.deal.findUnique({ where: { externalId: 'tm-1' } });
      expect(after!.expiresAt.getTime()).toBe(before!.expiresAt.getTime());
    });
  });

  it('DB invariant: no non-authoritative deal is ever verified (incl. historical)', async () => {
    // Proves the corrective backfill migration + the ingest rule together: a
    // Verified status can only ever attach to authoritative provenance.
    await ingestion.run('fixture');
    await ingestion.run('editorial');
    const leaked = await prisma.deal.count({
      where: { sourceTrust: { not: 'authoritative' }, verificationStatus: 'verified' },
    });
    expect(leaked).toBe(0);
  });

  it('verifyAll skips non-authoritative sources (editorial stays pending, no run)', async () => {
    await ingestion.run('editorial');
    fakeTm.fetchResult = [authoritativeDeal()];
    await ingestion.run('ticketmaster');

    await verification.verifyAll();

    const editorial = await prisma.deal.findFirst({ where: { source: 'editorial' } });
    expect(editorial?.verificationStatus).toBe('pending'); // never promoted
    const editorialRuns = await prisma.verificationRun.count({ where: { provider: 'editorial' } });
    expect(editorialRuns).toBe(0);
    const tmRuns = await prisma.verificationRun.count({ where: { provider: 'ticketmaster' } });
    expect(tmRuns).toBeGreaterThanOrEqual(1);
  });
});
