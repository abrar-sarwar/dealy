import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

// Georgia State campus center.
const GSU = { lat: 33.7531, lng: -84.3857 };

/**
 * Guards the invariant that test/demo inventory cannot leak into production-visible
 * feeds. Per schema, `fixture` source-trust is dev/test inventory — it must never
 * appear in /local or /missed (which serve only editorial curated content). Any
 * demo/mock data MUST be fixture-trust so it is excluded here.
 */
describe('Production feeds exclude fixture/test inventory (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);

    await prisma.deal.deleteMany({ where: { source: 'e2e-fixture-leak' } });
    const cat = await prisma.category.findFirstOrThrow({ where: { slug: 'food' } });

    // A fixture (test/demo) deal that is otherwise fully eligible: published,
    // approved, physical, near GSU, and even a campus/student deal — exactly the
    // shape that wrongly leaked when seeded as `editorial`.
    const base = {
      merchant: 'Fixture Co',
      categoryId: cat.id,
      source: 'e2e-fixture-leak',
      sourceTrust: 'fixture' as const,
      moderationStatus: 'approved' as const,
      status: 'published' as const,
      verificationStatus: 'pending' as const,
      isOnline: false,
      latitude: GSU.lat + 0.005,
      longitude: GSU.lng,
      campusSlug: 'gsu',
      requiresStudentId: true,
    };
    await prisma.deal.create({
      data: { ...base, title: 'fixture-active', expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    });
    await prisma.deal.create({
      data: { ...base, title: 'fixture-expired', expiresAt: new Date(Date.now() - 2 * 86_400_000) },
    });
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { source: 'e2e-fixture-leak' } });
    await app.close();
  });

  const q = `lat=${GSU.lat}&lng=${GSU.lng}&radiusMiles=15&limit=50`;

  it('does NOT surface a fixture-trust deal in /v1/feeds/local', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/feeds/local?${q}` });
    expect(res.statusCode).toBe(200);
    const titles = (res.json() as { items: Array<{ title: string }> }).items.map((d) => d.title);
    expect(titles).not.toContain('fixture-active');
  });

  it('does NOT surface a fixture-trust deal in /v1/feeds/missed', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/feeds/missed?${q}` });
    expect(res.statusCode).toBe(200);
    const titles = (res.json() as { items: Array<{ title: string }> }).items.map((d) => d.title);
    expect(titles).not.toContain('fixture-expired');
  });
});
