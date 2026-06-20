import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

// Georgia State campus center (deals are seeded around it).
const GSU = { lat: 33.7531, lng: -84.3857 };
// An isolated point (>100mi from any seed cluster) for ranking/gating fixtures.
const REMOTE = { lat: 35.5, lng: -84.5 };

interface DealItem {
  id: string;
  title: string;
  distanceMiles: number | null;
  isOnline: boolean;
  verified: boolean;
}

describe('Deals + Feeds (e2e, public)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    await prisma.deal.deleteMany({ where: { source: 'e2e-feeds' } });
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { source: 'e2e-feeds' } });
    await app.close();
  });

  const nearby = (qs: string) => app.inject({ method: 'GET', url: `/v1/feeds/nearby?${qs}` });

  it('returns nearby deals sorted by ascending distance', async () => {
    const res = await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=5`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: DealItem[]; nextCursor: string | null };
    expect(body.items.length).toBeGreaterThan(0);
    for (let i = 1; i < body.items.length; i++) {
      expect(body.items[i].distanceMiles!).toBeGreaterThanOrEqual(body.items[i - 1].distanceMiles!);
    }
    // Online deals have no geography → never in nearby.
    expect(body.items.every((d) => d.isOnline === false)).toBe(true);
    // Every nearby deal carries a computed distance.
    expect(body.items.every((d) => typeof d.distanceMiles === 'number')).toBe(true);
  });

  it('a tiny radius returns no more than a large radius', async () => {
    const small = (await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=1`)).json() as {
      items: DealItem[];
    };
    const large = (await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=50`)).json() as {
      items: DealItem[];
    };
    expect(small.items.length).toBeLessThanOrEqual(large.items.length);
    expect(small.items.every((d) => d.distanceMiles! <= 1.0001)).toBe(true);
  });

  it('paginates with a stable cursor (no overlap, non-decreasing distance)', async () => {
    const p1 = (await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=50&limit=3`)).json() as {
      items: DealItem[];
      nextCursor: string | null;
    };
    expect(p1.items.length).toBe(3);
    expect(p1.nextCursor).toBeTruthy();

    const p2 = (
      await nearby(
        `lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=50&limit=3&cursor=${encodeURIComponent(p1.nextCursor!)}`,
      )
    ).json() as { items: DealItem[] };

    const ids1 = new Set(p1.items.map((d) => d.id));
    expect(p2.items.some((d) => ids1.has(d.id))).toBe(false);
    if (p2.items.length > 0) {
      expect(p2.items[0].distanceMiles!).toBeGreaterThanOrEqual(p1.items[2].distanceMiles!);
    }
  });

  it('rejects an invalid latitude', async () => {
    const res = await nearby(`lat=999&lng=${GSU.lng}`);
    expect(res.statusCode).toBe(400);
  });

  it('returns a deal detail by id and 404 for a missing id', async () => {
    const list = (await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=5`)).json() as {
      items: DealItem[];
    };
    const id = list.items[0].id;
    const detail = await app.inject({ method: 'GET', url: `/v1/deals/${id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().id).toBe(id);

    const missing = await app.inject({
      method: 'GET',
      url: '/v1/deals/00000000-0000-0000-0000-0000000000ff',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('filters by category slug', async () => {
    const res = await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=50&category=food`);
    const body = res.json() as { items: Array<{ category: string }> };
    expect(body.items.every((d) => d.category === 'food')).toBe(true);
  });

  it('accepts the full 100-mile nearby radius and rejects 101', async () => {
    const accepted = await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=100`);
    expect(accepted.statusCode).toBe(200);

    const rejected = await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=101`);
    expect(rejected.statusCode).toBe(400);
  });

  it('returns active online deals only from the online feed', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/feeds/online?limit=50' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: DealItem[]; nextCursor: string | null };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((deal) => deal.isOnline)).toBe(true);
    expect(body.items.every((deal) => deal.distanceMiles === null)).toBe(true);
  });

  it('paginates online deals without overlap', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/feeds/online?limit=2' });
    const p1 = first.json() as { items: DealItem[]; nextCursor: string | null };
    expect(p1.nextCursor).toBeTruthy();
    const second = await app.inject({
      method: 'GET',
      url: `/v1/feeds/online?limit=2&cursor=${encodeURIComponent(p1.nextCursor!)}`,
    });
    const p2 = second.json() as { items: DealItem[] };
    const firstIds = new Set(p1.items.map((item) => item.id));
    expect(p2.items.some((item) => firstIds.has(item.id))).toBe(false);
  });

  // ---- Verified-inventory gating + ranking (Atlanta pilot) ----

  async function makeDeal(over: Record<string, unknown>): Promise<string> {
    const cat = await prisma.category.findFirstOrThrow({ where: { slug: 'food' } });
    const deal = await prisma.deal.create({
      data: {
        title: 'fixture',
        merchant: 'M',
        categoryId: cat.id,
        source: 'e2e-feeds',
        status: 'published',
        verificationStatus: 'verified',
        isOnline: false,
        expiresAt: new Date(Date.now() + 86_400_000),
        ...over,
      },
      select: { id: true },
    });
    return deal.id;
  }

  it('marks every nearby deal as verified', async () => {
    const body = (await nearby(`lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=50`)).json() as {
      items: DealItem[];
    };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((d) => d.verified === true)).toBe(true);
  });

  it('never returns unverified, expired, or invalid physical deals in nearby', async () => {
    const pendingId = await makeDeal({
      title: 'Pending Physical',
      latitude: REMOTE.lat,
      longitude: REMOTE.lng,
      verificationStatus: 'pending',
    });
    const unreachableId = await makeDeal({
      title: 'Unreachable Physical',
      latitude: REMOTE.lat,
      longitude: REMOTE.lng,
      verificationStatus: 'unreachable',
    });
    const invalidId = await makeDeal({
      title: 'Invalid Physical',
      latitude: REMOTE.lat,
      longitude: REMOTE.lng,
      verificationStatus: 'invalid',
      status: 'archived',
    });
    const verifiedId = await makeDeal({
      title: 'Verified Physical',
      latitude: REMOTE.lat,
      longitude: REMOTE.lng,
    });

    const body = (await nearby(`lat=${REMOTE.lat}&lng=${REMOTE.lng}&radiusMiles=10`)).json() as {
      items: DealItem[];
    };
    const ids = new Set(body.items.map((d) => d.id));
    expect(ids.has(verifiedId)).toBe(true);
    expect(ids.has(pendingId)).toBe(false);
    expect(ids.has(unreachableId)).toBe(false);
    expect(ids.has(invalidId)).toBe(false);
  });

  it('does not let a marginally-closer very-stale deal outrank a fresh one', async () => {
    // Stale deal is slightly CLOSER to the query point but verified 8 days ago;
    // fresh deal is marginally farther but just confirmed. Fresh must rank first.
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    const staleCloser = await makeDeal({
      title: 'Stale Closer',
      latitude: 35.509, // ~0.62mi north of REMOTE
      longitude: REMOTE.lng,
      createdAt: eightDaysAgo,
      lastVerifiedAt: eightDaysAgo,
    });
    const freshFarther = await makeDeal({
      title: 'Fresh Farther',
      latitude: 35.51, // ~0.69mi north of REMOTE (farther)
      longitude: REMOTE.lng,
    });

    const body = (await nearby(`lat=${REMOTE.lat}&lng=${REMOTE.lng}&radiusMiles=5`)).json() as {
      items: DealItem[];
    };
    const order = body.items.map((d) => d.id);
    expect(order).toContain(freshFarther);
    expect(order).toContain(staleCloser);
    expect(order.indexOf(freshFarther)).toBeLessThan(order.indexOf(staleCloser));
  });

  it('online feed returns only verified online deals', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/feeds/online?limit=50' });
    const body = res.json() as { items: DealItem[] };
    expect(body.items.every((d) => d.verified === true)).toBe(true);
  });
});
