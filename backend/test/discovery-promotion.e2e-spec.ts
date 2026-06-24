import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { CandidatePromotionService } from '../src/discovery/candidate-promotion.service';

// Georgia State campus center.
const GSU = { lat: 33.7531, lng: -84.3857 };
const REGION = 'e2e-promo';
const FINGERPRINT = 'e2e-promo-fingerprint';

/**
 * Regression guard for the discovery contract that unit tests alone missed: a
 * promoted candidate must actually be RETURNED by the geographic local feed.
 * The defect was that promotion produced coordinate-less deals (null geog), so
 * they were filtered out by /v1/feeds/local's `geog IS NOT NULL` + ST_DWithin.
 * This exercises candidate → CandidatePromotionService.promoteRegion → geog →
 * GET /v1/feeds/local end to end against PostGIS.
 */
describe('Discovery promotion → local feed (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let promotion: CandidatePromotionService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    promotion = app.get(CandidatePromotionService);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    await prisma.deal.deleteMany({ where: { fingerprint: FINGERPRINT } });
    await prisma.dealCandidate.deleteMany({ where: { fingerprint: FINGERPRINT } });
    await prisma.regionalInventory.deleteMany({ where: { regionSlug: REGION } });
  }

  it('promotes a high-confidence candidate so it surfaces in GET /v1/feeds/local', async () => {
    const category = await prisma.category.findFirst({ select: { slug: true } });
    expect(category).toBeTruthy();

    const inventory = await prisma.regionalInventory.create({
      data: {
        regionSlug: REGION,
        regionName: 'E2E Promo Region',
        regionType: 'metro',
        latitude: GSU.lat,
        longitude: GSU.lng,
        radiusMiles: 15,
      },
    });

    await prisma.dealCandidate.create({
      data: {
        sourceUrl: 'https://example.test/e2e-promo',
        title: 'E2E Promoted Local Deal',
        merchant: 'E2E Merchant',
        categorySlug: category!.slug,
        locationText: 'Near GSU',
        latitude: GSU.lat + 0.01, // ~0.7mi from the query point
        longitude: GSU.lng,
        summary: 'A promoted discovery deal that must reach the local feed.',
        confidence: 95,
        verificationStatus: 'pending',
        fingerprint: FINGERPRINT,
        regionalInventoryId: inventory.id,
      },
    });

    const result = await promotion.promoteRegion(REGION);
    expect(result.promoted).toBe(1);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/feeds/local?lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=15&limit=50`,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ title: string; isOnline: boolean }>;
    const promoted = items.find((d) => d.title === 'E2E Promoted Local Deal');
    expect(promoted).toBeTruthy();
    expect(promoted!.isOnline).toBe(false);
  });
});
