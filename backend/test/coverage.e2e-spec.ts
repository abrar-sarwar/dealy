import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { CoverageService } from '../src/coverage/coverage.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Isolated point far from any seed cluster so only our fixtures count.
const ZONE = { slug: 'test-zone', name: 'Test Zone', latitude: 35.5, longitude: -84.5 };

describe('Coverage (density-first, e2e)', () => {
  let app: INestApplicationContext;
  let coverage: CoverageService;
  let prisma: PrismaService;
  let foodId: string;
  let techId: string;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    coverage = app.get(CoverageService);
    prisma = app.get(PrismaService);
    foodId = (await prisma.category.findFirstOrThrow({ where: { slug: 'food' } })).id;
    techId = (await prisma.category.findFirstOrThrow({ where: { slug: 'tech' } })).id;
    await prisma.deal.deleteMany({ where: { source: 'e2e-coverage' } });
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { source: 'e2e-coverage' } });
    await app.close();
  });

  function make(n: number, over: Record<string, unknown> = {}) {
    return Array.from({ length: n }, (_, i) =>
      prisma.deal.create({
        data: {
          title: `cov-${Math.random()}`,
          merchant: 'M',
          categoryId: foodId,
          source: 'e2e-coverage',
          sourceTrust: 'authoritative',
          status: 'published',
          verificationStatus: 'verified',
          isOnline: false,
          // Small offsets keep these within ~1.5mi of the zone center.
          latitude: ZONE.latitude + i * 0.001,
          longitude: ZONE.longitude,
          expiresAt: new Date(Date.now() + 86_400_000),
          ...over,
        },
      }),
    );
  }

  it('does not qualify a zone at 19 verified deals within 10mi', async () => {
    await Promise.all(make(19));
    const z = await coverage.zoneCoverage(ZONE);
    expect(z.dealsWithin10mi).toBe(19);
    expect(z.qualifies).toBe(false);
  });

  it('qualifies a zone at exactly 20 verified deals within 10mi', async () => {
    await Promise.all(make(1, { latitude: ZONE.latitude + 0.05 }));
    const z = await coverage.zoneCoverage(ZONE);
    expect(z.dealsWithin10mi).toBe(20);
    expect(z.qualifies).toBe(true);
  });

  it('does not count online, expired, unverified, non-pilot, or out-of-radius deals', async () => {
    await Promise.all([
      ...make(1, { isOnline: true, latitude: ZONE.latitude }), // online
      ...make(1, { expiresAt: new Date(Date.now() - 1000), status: 'expired' }), // expired
      ...make(1, { verificationStatus: 'pending' }), // unverified
      ...make(1, { verificationStatus: 'unreachable' }), // unreachable
      ...make(1, { categoryId: techId }), // non-pilot category
      ...make(1, { latitude: ZONE.latitude + 0.25 }), // ~17mi away, out of radius
      // Non-authoritative inventory must NOT count — even if (wrongly) marked verified.
      ...make(1, { sourceTrust: 'editorial' }),
      ...make(1, { sourceTrust: 'fixture' }),
    ]);
    const z = await coverage.zoneCoverage(ZONE);
    // Still exactly the 20 valid ones — none of the noise counts.
    expect(z.dealsWithin10mi).toBe(20);
    expect(z.qualifies).toBe(true);
    expect(z.categoryDistribution.food).toBe(20);
    expect(z.categoryDistribution.groceries).toBe(0);
  });

  it('produces an operational report with thresholds and provider health', async () => {
    const report = await coverage.report();
    expect(report.thresholds).toEqual({ minDeals: 20, radiusMiles: 10 });
    expect(Array.isArray(report.zones)).toBe(true);
    expect(report.verificationStatusCounts).toHaveProperty('verified');
    expect(Array.isArray(report.providerHealth)).toBe(true);
  });

  // ---- Density-first rollout gate (coverageForPoint) ----

  describe('coverageForPoint', () => {
    // Two enabled zones at isolated points (no seed/other-test inventory nearby).
    const QZONE = { slug: 'e2e-cov-qual', lat: 36.2, lng: -85.2 };
    const UZONE = { slug: 'e2e-cov-low', lat: 37.2, lng: -86.2 };
    const OVERLAP = { slug: 'e2e-cov-overlap', lat: 36.205, lng: -85.205 }; // overlaps QZONE
    const DZONE = { lat: 38.5, lng: -87.5 }; // disabled zone location, well-stocked

    beforeAll(async () => {
      await prisma.coverageZone.deleteMany({ where: { slug: { startsWith: 'e2e-cov-' } } });
      await prisma.deal.deleteMany({ where: { source: 'e2e-cov' } });
      await prisma.coverageZone.createMany({
        data: [
          {
            slug: QZONE.slug,
            name: 'Q',
            latitude: QZONE.lat,
            longitude: QZONE.lng,
            radiusMiles: 10,
            enabled: true,
          },
          {
            slug: UZONE.slug,
            name: 'U',
            latitude: UZONE.lat,
            longitude: UZONE.lng,
            radiusMiles: 10,
            enabled: true,
          },
          {
            slug: OVERLAP.slug,
            name: 'O',
            latitude: OVERLAP.lat,
            longitude: OVERLAP.lng,
            radiusMiles: 10,
            enabled: true,
          },
          // A DISABLED zone (distinct location) must never serve Nearby even when
          // it has plenty of authoritative inventory.
          {
            slug: 'e2e-cov-disabled',
            name: 'D',
            latitude: DZONE.lat,
            longitude: DZONE.lng,
            radiusMiles: 10,
            enabled: false,
          },
        ],
      });
      // QZONE: exactly 20 authoritative deals → qualifies. UZONE: 19 → not.
      const seedAt = async (lat: number, lng: number, n: number) => {
        const cat = await prisma.category.findFirstOrThrow({ where: { slug: 'food' } });
        for (let i = 0; i < n; i++) {
          await prisma.deal.create({
            data: {
              title: `cov-${lat}-${i}`,
              merchant: 'M',
              categoryId: cat.id,
              source: 'e2e-cov',
              sourceTrust: 'authoritative',
              status: 'published',
              verificationStatus: 'verified',
              isOnline: false,
              latitude: lat + i * 0.0005,
              longitude: lng,
              expiresAt: new Date(Date.now() + 86_400_000),
            },
          });
        }
      };
      await seedAt(QZONE.lat, QZONE.lng, 20);
      await seedAt(UZONE.lat, UZONE.lng, 19);
      await seedAt(DZONE.lat, DZONE.lng, 25); // disabled zone has inventory, still ignored
    });

    afterAll(async () => {
      await prisma.coverageZone.deleteMany({ where: { slug: { startsWith: 'e2e-cov-' } } });
      await prisma.deal.deleteMany({ where: { source: 'e2e-cov' } });
    });

    it('qualifies a point inside an enabled zone meeting the threshold (20)', async () => {
      const s = await coverage.coverageForPoint(QZONE.lat, QZONE.lng);
      expect(s).toEqual({ qualified: true, reason: 'qualified', zoneSlug: expect.any(String) });
    });

    it('reports low_coverage inside an enabled zone below the threshold (19)', async () => {
      const s = await coverage.coverageForPoint(UZONE.lat, UZONE.lng);
      expect(s.qualified).toBe(false);
      expect(s.reason).toBe('low_coverage');
    });

    it('reports outside_coverage when no enabled zone contains the point', async () => {
      const s = await coverage.coverageForPoint(0, 0);
      expect(s).toEqual({ qualified: false, reason: 'outside_coverage', zoneSlug: null });
    });

    it('treats a point in overlapping zones as qualified if ANY containing zone qualifies', async () => {
      // OVERLAP point lies inside both the qualified QZONE and its own (empty) zone.
      const s = await coverage.coverageForPoint(OVERLAP.lat, OVERLAP.lng);
      expect(s.qualified).toBe(true);
    });

    it('does not qualify a point covered only by a DISABLED zone (even if well-stocked)', async () => {
      const s = await coverage.coverageForPoint(DZONE.lat, DZONE.lng);
      expect(s.qualified).toBe(false);
      expect(s.reason).toBe('outside_coverage'); // disabled zones aren't "coverage"
    });
  });

  // ---- Readiness metrics cannot be inflated (delta assertions, global-state safe) ----

  describe('report() readiness metrics', () => {
    const RZ = { lat: 39.5, lng: -88.5 }; // isolated readiness-test location
    let foodId: string;

    const seedAt = async (over: Record<string, unknown>, n = 1) => {
      for (let i = 0; i < n; i++) {
        await prisma.deal.create({
          data: {
            title: `rdy-${Math.random()}`,
            merchant: 'M',
            categoryId: foodId,
            source: 'e2e-rdy',
            sourceTrust: 'authoritative',
            status: 'published',
            verificationStatus: 'verified',
            isOnline: false,
            latitude: RZ.lat + i * 0.0005,
            longitude: RZ.lng,
            expiresAt: new Date(Date.now() + 86_400_000),
            ...over,
          },
        });
      }
    };

    beforeAll(async () => {
      foodId = (await prisma.category.findFirstOrThrow({ where: { slug: 'food' } })).id;
      await prisma.deal.deleteMany({ where: { source: 'e2e-rdy' } });
      await prisma.coverageZone.deleteMany({ where: { slug: { startsWith: 'e2e-rdy-' } } });
    });

    afterAll(async () => {
      await prisma.deal.deleteMany({ where: { source: 'e2e-rdy' } });
      await prisma.coverageZone.deleteMany({ where: { slug: { startsWith: 'e2e-rdy-' } } });
    });

    it('non-authoritative, expired, and unreachable inventory do not inflate totalActiveVerified', async () => {
      const before = (await coverage.report()).totalActiveVerified;
      await seedAt({ sourceTrust: 'editorial' });
      await seedAt({ sourceTrust: 'fixture' });
      await seedAt({ verificationStatus: 'pending' });
      await seedAt({ verificationStatus: 'unreachable' });
      await seedAt({ verificationStatus: 'invalid', status: 'archived' });
      await seedAt({ expiresAt: new Date(Date.now() - 1000), status: 'expired' });
      const afterNoise = (await coverage.report()).totalActiveVerified;
      expect(afterNoise).toBe(before); // noise changes nothing

      await seedAt({}); // one real authoritative verified unexpired deal
      const afterReal = (await coverage.report()).totalActiveVerified;
      expect(afterReal).toBe(before + 1);
    });

    it('only authoritative verified physical deals within 48h count as expiringSoon', async () => {
      const soon = () => new Date(Date.now() + 12 * 60 * 60 * 1000);
      const before = (await coverage.report()).expiringSoon;
      await seedAt({ sourceTrust: 'editorial', expiresAt: soon() });
      await seedAt({ isOnline: true, latitude: null, longitude: null, expiresAt: soon() });
      await seedAt({ verificationStatus: 'pending', expiresAt: soon() });
      expect((await coverage.report()).expiringSoon).toBe(before); // noise excluded

      await seedAt({ expiresAt: soon() }); // authoritative verified physical, 48h
      expect((await coverage.report()).expiringSoon).toBe(before + 1);
    });

    it('a DISABLED zone with 20+ deals is not counted as qualified; enabling it counts', async () => {
      const before = (await coverage.report()).qualifiedZoneCount;
      await prisma.coverageZone.create({
        data: {
          slug: 'e2e-rdy-zone',
          name: 'Rdy',
          latitude: RZ.lat,
          longitude: RZ.lng,
          radiusMiles: 10,
          enabled: false,
        },
      });
      await seedAt({}, 20); // 20 authoritative verified physical deals in the zone
      const disabledReport = await coverage.report();
      const zone = disabledReport.zones.find((z) => z.slug === 'e2e-rdy-zone')!;
      expect(zone.qualifies).toBe(true); // it HAS the inventory
      expect(zone.enabled).toBe(false);
      expect(disabledReport.qualifiedZoneCount).toBe(before); // ...but not "qualified"

      await prisma.coverageZone.update({
        where: { slug: 'e2e-rdy-zone' },
        data: { enabled: true },
      });
      expect((await coverage.report()).qualifiedZoneCount).toBe(before + 1);
    });

    it('admin report and feed gate agree (same trust + qualification)', async () => {
      // Zone enabled + qualified from the previous test.
      const report = await coverage.report();
      const zone = report.zones.find((z) => z.slug === 'e2e-rdy-zone')!;
      const gate = await coverage.coverageForPoint(RZ.lat, RZ.lng);
      // Report says enabled+qualified  <=>  gate says qualified.
      expect(zone.enabled && zone.qualifies).toBe(gate.qualified);
      expect(gate.qualified).toBe(true);
    });
  });
});
