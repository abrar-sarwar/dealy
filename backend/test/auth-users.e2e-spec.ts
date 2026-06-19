import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { JWKS_RESOLVER } from '../src/auth/auth.constants';
import { PrismaService } from '../src/prisma/prisma.service';

// Valid UUIDs — Supabase `sub` is a UUID and our column is typed UUID.
const SUB_A = '11111111-1111-1111-1111-1111111111aa';
const SUB_B = '22222222-2222-2222-2222-2222222222bb';

describe('Auth + Users (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let privateKey: CryptoKey;

  const token = (sub: string, email: string) =>
    new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid: 'e2e' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setSubject(sub)
      .setAudience('authenticated')
      .sign(privateKey);

  // For requests with a JSON body.
  const auth = (t: string) => ({
    authorization: `Bearer ${t}`,
    'content-type': 'application/json',
  });
  // For bodyless requests (GET/DELETE) — Fastify rejects an empty JSON body.
  const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

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
    await prisma.category.upsert({
      where: { slug: 'food' },
      update: {},
      create: { slug: 'food', displayName: 'Food' },
    });
    await prisma.user.deleteMany({ where: { supabaseUserId: { in: [SUB_A, SUB_B] } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { supabaseUserId: { in: [SUB_A, SUB_B] } } });
    await app.close();
  });

  it('rejects /v1/me without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
  });

  it('serves public reference data without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/categories' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('creates the user on first call and is idempotent', async () => {
    const t = await token(SUB_A, 'a@dealy.app');
    const r1 = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(t) });
    expect(r1.statusCode).toBe(200);
    const r2 = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(t) });
    expect(r2.json().id).toBe(r1.json().id);
    expect(r1.json().email).toBe('a@dealy.app');
  });

  it('isolates users by token (ownership)', async () => {
    const ta = await token(SUB_A, 'a@dealy.app');
    const tb = await token(SUB_B, 'b@dealy.app');
    const ra = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(ta) });
    const rb = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(tb) });
    expect(ra.json().id).not.toBe(rb.json().id);
  });

  it('updates preferences and rejects an out-of-range radius', async () => {
    const t = await token(SUB_A, 'a@dealy.app');
    const ok = await app.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: auth(t),
      payload: { searchRadiusMiles: 10, notificationsEnabled: true },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().searchRadiusMiles).toBe(10);

    const bad = await app.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: auth(t),
      payload: { searchRadiusMiles: 999 },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('sets interests + onboarding via PATCH and rejects unknown slugs', async () => {
    const t = await token(SUB_A, 'a@dealy.app');
    const ok = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: auth(t),
      payload: { interests: ['food'], onboardingCompleted: true },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().interests).toContain('food');
    expect(ok.json().profile.onboardingCompleted).toBe(true);

    const bad = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: auth(t),
      payload: { interests: ['not-a-real-category'] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('rejects unknown body properties (forbidNonWhitelisted)', async () => {
    const t = await token(SUB_A, 'a@dealy.app');
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: auth(t),
      payload: { hacker: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('soft-deletes the account, then rejects the same token', async () => {
    const t = await token(SUB_B, 'b@dealy.app');
    await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(t) }); // ensure exists
    const del = await app.inject({ method: 'DELETE', url: '/v1/me', headers: bearer(t) });
    expect(del.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(t) });
    expect(after.statusCode).toBe(401);
  });
});
