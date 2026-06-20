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
});
