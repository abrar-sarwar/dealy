import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { JWKS_RESOLVER } from '../src/auth/auth.constants';
import { PrismaService } from '../src/prisma/prisma.service';

const SUB = '88888888-8888-8888-8888-8888888888dd';

interface Rec {
  id: string;
  score: number;
  reasons: string[];
}

describe('Recommendations + Analytics (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let privateKey: CryptoKey;
  let bearerToken: string;

  const bare = (t: string) => ({ authorization: `Bearer ${t}` });
  const json = (t: string) => ({
    authorization: `Bearer ${t}`,
    'content-type': 'application/json',
  });

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'e2e', alg: 'RS256', use: 'sig' };
    const jwks = createLocalJWKSet({ keys: [jwk] });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JWKS_RESOLVER)
      .useValue(jwks)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);

    await prisma.user.deleteMany({ where: { supabaseUserId: SUB } });
    bearerToken = await new SignJWT({ email: 'rec@dealy.app' })
      .setProtectedHeader({ alg: 'RS256', kid: 'e2e' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setSubject(SUB)
      .setAudience('authenticated')
      .sign(privateKey);

    // Onboard: pick the GSU campus + food interest so recommendations have signal.
    const campuses = (await app.inject({ method: 'GET', url: '/v1/campuses' })).json() as Array<{
      id: string;
      slug: string;
    }>;
    const gsu = campuses.find((c) => c.slug === 'gsu')!;
    await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: json(bearerToken),
      payload: { campusId: gsu.id, interests: ['food'], onboardingCompleted: true },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { supabaseUserId: SUB } });
    await app.close();
  });

  it('requires auth for the recommended feed', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/feeds/recommended' });
    expect(res.statusCode).toBe(401);
  });

  it('returns explainable, score-sorted recommendations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/feeds/recommended?limit=20',
      headers: bare(bearerToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Rec[]; total: number };
    expect(body.items.length).toBeGreaterThan(0);
    // Every item has reasons; scores are non-increasing.
    expect(body.items.every((d) => Array.isArray(d.reasons) && d.reasons.length > 0)).toBe(true);
    for (let i = 1; i < body.items.length; i++) {
      expect(body.items[i].score).toBeLessThanOrEqual(body.items[i - 1].score);
    }
    // At least one deal cites the food-interest match.
    expect(body.items.some((d) => d.reasons.some((r) => /Food interest/i.test(r)))).toBe(true);
  });

  it('excludes already-swiped deals from recommendations', async () => {
    const first = (
      await app.inject({
        method: 'GET',
        url: '/v1/feeds/recommended?limit=20',
        headers: bare(bearerToken),
      })
    ).json() as { items: Rec[] };
    const target = first.items[0].id;

    await app.inject({
      method: 'POST',
      url: `/v1/deals/${target}/swipes`,
      headers: json(bearerToken),
      payload: { direction: 'left' },
    });

    const after = (
      await app.inject({
        method: 'GET',
        url: '/v1/feeds/recommended?limit=50',
        headers: bare(bearerToken),
      })
    ).json() as { items: Rec[] };
    expect(after.items.some((d) => d.id === target)).toBe(false);
  });

  it('serves trending publicly', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/feeds/trending?limit=10' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().items)).toBe(true);
  });

  it('accepts a valid analytics event and rejects an invalid one', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: json(bearerToken),
      payload: { event: 'feed_loaded', properties: { feed: 'recommended', count: 12 } },
    });
    expect(ok.statusCode).toBe(202);

    const bad = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: json(bearerToken),
      payload: { event: 'not_a_real_event' },
    });
    expect(bad.statusCode).toBe(400);

    const noauth = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'content-type': 'application/json' },
      payload: { event: 'feed_loaded' },
    });
    expect(noauth.statusCode).toBe(401);
  });

  it('returns a uniform error envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/deals/00000000-0000-0000-0000-0000000000ff',
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as {
      error: { code: string; message: string; statusCode: number; requestId: string };
    };
    expect(body.error.statusCode).toBe(404);
    expect(body.error.code).toBeTruthy();
    expect(body.error.message).toBeTruthy();
    expect(body.error.requestId).toBeTruthy();
  });
});
