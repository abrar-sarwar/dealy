import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

// Georgia State campus center (deals are seeded around it).
const GSU = { lat: 33.7531, lng: -84.3857 };

interface DealItem {
  id: string;
  title: string;
  distanceMiles: number | null;
  isOnline: boolean;
}

describe('Deals + Feeds (e2e, public)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
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
});
