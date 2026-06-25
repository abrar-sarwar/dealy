import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

// Georgia State campus center — used throughout feed tests.
const GSU = { lat: 33.7531, lng: -84.3857 };

describe('GET /v1/feeds/missed (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);

    // Clean up any leftover fixtures from previous runs.
    await prisma.deal.deleteMany({ where: { source: 'e2e-missed' } });

    const cat = await prisma.category.findFirstOrThrow({ where: { slug: 'food' } });

    // Shared base shape: curated, approved, published, physical, near GSU.
    const base = {
      merchant: 'Test Merchant',
      categoryId: cat.id,
      source: 'e2e-missed',
      sourceTrust: 'editorial' as const,
      moderationStatus: 'approved' as const,
      status: 'published' as const,
      verificationStatus: 'pending' as const,
      isOnline: false,
      latitude: GSU.lat + 0.005, // ~0.35mi north of GSU
      longitude: GSU.lng,
    };

    // Deal 1: expires in the future (+2 days) — must NOT appear in /missed.
    await prisma.deal.create({
      data: {
        ...base,
        title: 'e2e-missed-future',
        expiresAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
      },
    });

    // Deal 2: expired 2 days ago — within the 7-day window, MUST appear.
    await prisma.deal.create({
      data: {
        ...base,
        title: 'e2e-missed-recent',
        expiresAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      },
    });

    // Deal 3: expired 30 days ago — outside the window, must NOT appear.
    await prisma.deal.create({
      data: {
        ...base,
        title: 'e2e-missed-old',
        expiresAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      },
    });
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { source: 'e2e-missed' } });
    await app.close();
  });

  const missedUrl = `lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=15`;

  it('returns the 2-days-ago deal and excludes future and 30-days-ago deals', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/feeds/missed?${missedUrl}`,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      items: Array<{ id: string; title: string; expiresAt: string }>;
      nextCursor: string | null;
    };

    const titles = body.items.map((d) => d.title);

    // The 2-days-ago deal must be present.
    expect(titles).toContain('e2e-missed-recent');

    // Future deal belongs in /local, not /missed.
    expect(titles).not.toContain('e2e-missed-future');

    // 30-days-ago deal is outside the 7-day window.
    expect(titles).not.toContain('e2e-missed-old');
  });

  it('every returned item has an expiresAt in the past', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/feeds/missed?${missedUrl}`,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { items: Array<{ expiresAt: string }> };
    const now = Date.now();
    for (const item of body.items) {
      expect(new Date(item.expiresAt).getTime()).toBeLessThan(now);
    }
  });

  it('returns nextCursor: null (no pagination on missed feed)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/feeds/missed?${missedUrl}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { nextCursor: string | null };
    expect(body.nextCursor).toBeNull();
  });

  it('GET /v1/feeds/local does NOT return the recently-expired (2-days-ago) deal', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/feeds/local?${missedUrl}&limit=50`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ title: string }> };
    const titles = body.items.map((d) => d.title);
    expect(titles).not.toContain('e2e-missed-recent');
  });

  it('items are sorted most-recently-expired first', async () => {
    // Seed a second expired deal so we can verify ordering.
    const cat = await prisma.category.findFirstOrThrow({ where: { slug: 'food' } });
    await prisma.deal.create({
      data: {
        title: 'e2e-missed-1day',
        merchant: 'Test Merchant',
        categoryId: cat.id,
        source: 'e2e-missed',
        sourceTrust: 'editorial',
        moderationStatus: 'approved',
        status: 'published',
        verificationStatus: 'pending',
        isOnline: false,
        latitude: GSU.lat + 0.005,
        longitude: GSU.lng,
        expiresAt: new Date(Date.now() - 1 * 24 * 3600 * 1000), // 1 day ago — more recent
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/feeds/missed?${missedUrl}&limit=20`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ expiresAt: string }> };

    // Verify descending expires_at order.
    for (let i = 1; i < body.items.length; i++) {
      const prev = new Date(body.items[i - 1].expiresAt).getTime();
      const curr = new Date(body.items[i].expiresAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});
