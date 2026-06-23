import type { PrismaService } from '../src/prisma/prisma.service';

/** Georgia State campus center — the coordinate most feed tests query around. */
export const GSU = { lat: 33.7531, lng: -84.3857 };

/**
 * Seed authoritative, verified, physical deals near a center for feed/coverage
 * tests. Seed/fixture/editorial inventory is intentionally NON-authoritative now,
 * so feed tests must create their own authoritative inventory to assert against.
 * Returns created deal ids (ascending distance from the center).
 */
export async function seedAuthoritativeNearby(
  prisma: PrismaService,
  opts: {
    count?: number;
    source?: string;
    categorySlug?: string;
    lat?: number;
    lng?: number;
    stepDeg?: number;
  } = {},
): Promise<string[]> {
  const count = opts.count ?? 6;
  const source = opts.source ?? 'e2e-auth';
  const lat = opts.lat ?? GSU.lat;
  const lng = opts.lng ?? GSU.lng;
  const step = opts.stepDeg ?? 0.002;
  const cat = await prisma.category.findFirstOrThrow({
    where: { slug: opts.categorySlug ?? 'food' },
  });
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = await prisma.deal.create({
      data: {
        title: `auth-${source}-${i}`,
        merchant: 'M',
        categoryId: cat.id,
        source,
        sourceTrust: 'authoritative',
        status: 'published',
        verificationStatus: 'verified',
        lastVerifiedAt: new Date(),
        isOnline: false,
        latitude: lat + i * step,
        longitude: lng,
        currentPriceMinor: 500n,
        originalPriceMinor: 1000n,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      select: { id: true },
    });
    ids.push(d.id);
  }
  return ids;
}

/** Seed authoritative, verified ONLINE-only deals for Anywhere-feed tests. */
export async function seedAuthoritativeOnline(
  prisma: PrismaService,
  opts: { count?: number; source?: string; categorySlug?: string } = {},
): Promise<string[]> {
  const count = opts.count ?? 3;
  const source = opts.source ?? 'e2e-auth';
  const cat = await prisma.category.findFirstOrThrow({
    where: { slug: opts.categorySlug ?? 'food' },
  });
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = await prisma.deal.create({
      data: {
        title: `auth-online-${source}-${i}`,
        merchant: 'M',
        categoryId: cat.id,
        source,
        sourceTrust: 'authoritative',
        status: 'published',
        verificationStatus: 'verified',
        lastVerifiedAt: new Date(),
        isOnline: true,
        currentPriceMinor: 500n,
        originalPriceMinor: 1000n,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      select: { id: true },
    });
    ids.push(d.id);
  }
  return ids;
}
