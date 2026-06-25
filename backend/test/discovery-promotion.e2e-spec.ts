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
const FINGERPRINT_IMG = 'e2e-promo-fingerprint-img';
const FINGERPRINT_CAMPUS = 'e2e-promo-fingerprint-campus';
const OG_IMAGE_URL = 'https://cdn.example.com/og-deal-hero.jpg';
const FINGERPRINT_AUDIENCE = 'e2e-promo-fingerprint-audience';

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
    await prisma.deal.deleteMany({
      where: {
        fingerprint: {
          in: [FINGERPRINT, FINGERPRINT_IMG, FINGERPRINT_CAMPUS, FINGERPRINT_AUDIENCE],
        },
      },
    });
    await prisma.dealCandidate.deleteMany({
      where: {
        fingerprint: {
          in: [FINGERPRINT, FINGERPRINT_IMG, FINGERPRINT_CAMPUS, FINGERPRINT_AUDIENCE],
        },
      },
    });
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
        qualityScore: 90, // concrete, promotable — must clear the publish quality floor
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
    const items = res.json().items as Array<{
      title: string;
      isOnline: boolean;
      locationPrecision: string;
      distanceMiles: number | null;
      imageUrl: string | null;
    }>;
    const promoted = items.find((d) => d.title === 'E2E Promoted Local Deal');
    expect(promoted).toBeTruthy();
    expect(promoted!.isOnline).toBe(false);
    // Honest coordinates: precision is surfaced to the client so it can show a
    // "approximate location" disclaimer instead of a pin-precise marker.
    expect(promoted!.locationPrecision).toBe('approximate');
    // Distance is the true ST_Distance from query point to centroid (not scattered).
    expect(promoted!.distanceMiles).not.toBeNull();
    // imageUrl is null when no OG image was set on the candidate.
    expect(promoted!.imageUrl).toBeNull();
  });

  it('carries imageUrl from candidate through promotion to the /v1/feeds/local response', async () => {
    const category = await prisma.category.findFirst({ select: { slug: true } });
    expect(category).toBeTruthy();

    // Reuse the inventory created in the prior test (cleanup runs in afterAll).
    const inventory = await prisma.regionalInventory.findFirst({ where: { regionSlug: REGION } });
    expect(inventory).toBeTruthy();

    await prisma.dealCandidate.create({
      data: {
        sourceUrl: 'https://example.test/e2e-promo-img',
        title: 'E2E Promoted Local Deal With Image',
        merchant: 'E2E Merchant',
        categorySlug: category!.slug,
        locationText: 'Near GSU',
        latitude: GSU.lat + 0.01,
        longitude: GSU.lng,
        summary: 'A promoted deal with a real OG image.',
        confidence: 95,
        qualityScore: 90, // concrete, promotable — must clear the publish quality floor
        verificationStatus: 'pending',
        fingerprint: FINGERPRINT_IMG,
        regionalInventoryId: inventory!.id,
        imageUrl: OG_IMAGE_URL,
      },
    });

    const result = await promotion.promoteRegion(REGION);
    expect(result.promoted).toBe(1);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/feeds/local?lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=15&limit=50`,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{
      title: string;
      imageUrl: string | null;
    }>;
    const promoted = items.find((d) => d.title === 'E2E Promoted Local Deal With Image');
    expect(promoted).toBeTruthy();
    expect(promoted!.imageUrl).toBe(OG_IMAGE_URL);
  });

  it('carries campusSlug and requiresStudentId from candidate through promotion to /v1/feeds/local', async () => {
    const category = await prisma.category.findFirst({ select: { slug: true } });
    expect(category).toBeTruthy();

    // Reuse the inventory created in the first test (cleanup runs in afterAll).
    const inventory = await prisma.regionalInventory.findFirst({ where: { regionSlug: REGION } });
    expect(inventory).toBeTruthy();

    await prisma.dealCandidate.create({
      data: {
        sourceUrl: 'https://example.test/e2e-campus',
        title: 'E2E Campus Student Deal',
        merchant: 'E2E Campus Merchant',
        categorySlug: category!.slug,
        locationText: 'Near GSU',
        latitude: GSU.lat + 0.01,
        longitude: GSU.lng,
        summary: 'A campus-tagged student deal.',
        confidence: 95,
        qualityScore: 90, // concrete, promotable — must clear the publish quality floor
        verificationStatus: 'pending',
        fingerprint: FINGERPRINT_CAMPUS,
        regionalInventoryId: inventory!.id,
        campusSlug: 'gsu',
        requiresStudentId: true,
      },
    });

    const result = await promotion.promoteRegion(REGION);
    expect(result.promoted).toBeGreaterThanOrEqual(1);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/feeds/local?lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=15&limit=50`,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{
      title: string;
      campusSlug: string | null;
      requiresStudentId: boolean;
    }>;
    const promoted = items.find((d) => d.title === 'E2E Campus Student Deal');
    expect(promoted).toBeTruthy();
    expect(promoted!.campusSlug).toBe('gsu');
    expect(promoted!.requiresStudentId).toBe(true);
  });

  it('carries audience and campusDealType from candidate through promotion to /v1/feeds/local', async () => {
    const category = await prisma.category.findFirst({ select: { slug: true } });
    expect(category).toBeTruthy();

    const inventory = await prisma.regionalInventory.findFirst({ where: { regionSlug: REGION } });
    expect(inventory).toBeTruthy();

    await prisma.dealCandidate.create({
      data: {
        sourceUrl: 'https://example.test/e2e-audience',
        title: 'E2E Faculty Staff Perk',
        merchant: 'E2E Campus Merchant',
        categorySlug: category!.slug,
        locationText: 'Near GSU',
        latitude: GSU.lat + 0.01,
        longitude: GSU.lng,
        summary: 'A faculty/staff perk from the campus deal pipeline.',
        confidence: 95,
        qualityScore: 90, // concrete, promotable — must clear the publish quality floor
        verificationStatus: 'pending',
        fingerprint: FINGERPRINT_AUDIENCE,
        regionalInventoryId: inventory!.id,
        campusSlug: 'gsu',
        requiresStudentId: false,
        audience: 'faculty_staff',
        campusDealType: 'campus_perk',
      },
    });

    const result = await promotion.promoteRegion(REGION);
    expect(result.promoted).toBeGreaterThanOrEqual(1);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/feeds/local?lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=15&limit=50`,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{
      title: string;
      audience: string;
      campusDealType: string | null;
    }>;
    const promoted = items.find((d) => d.title === 'E2E Faculty Staff Perk');
    expect(promoted).toBeTruthy();
    expect(promoted!.audience).toBe('faculty_staff');
    expect(promoted!.campusDealType).toBe('campus_perk');
  });
});
