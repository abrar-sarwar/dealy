import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { JWKS_RESOLVER } from '../src/auth/auth.constants';
import { PrismaService } from '../src/prisma/prisma.service';

const SUB_A = '33333333-3333-3333-3333-3333333333aa';
const SUB_B = '44444444-4444-4444-4444-4444444444bb';
const IDEM_KEY = 'test-idem-key-actions-1';

interface DealItem {
  id: string;
}

describe('Actions (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let privateKey: CryptoKey;

  const token = (sub: string) =>
    new SignJWT({ email: `${sub}@dealy.app` })
      .setProtectedHeader({ alg: 'RS256', kid: 'e2e' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setSubject(sub)
      .setAudience('authenticated')
      .sign(privateKey);

  const json = (t: string) => ({
    authorization: `Bearer ${t}`,
    'content-type': 'application/json',
  });
  const bare = (t: string) => ({ authorization: `Bearer ${t}` });

  let dealIds: string[] = [];

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

    await prisma.user.deleteMany({ where: { supabaseUserId: { in: [SUB_A, SUB_B] } } });
    await prisma.idempotencyKey.deleteMany({ where: { key: IDEM_KEY } });

    const feed = await app.inject({
      method: 'GET',
      url: '/v1/feeds/nearby?lat=33.7531&lng=-84.3857&radiusMiles=50&limit=10',
    });
    dealIds = (feed.json() as { items: DealItem[] }).items.map((d) => d.id);
    expect(dealIds.length).toBeGreaterThan(3);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { supabaseUserId: { in: [SUB_A, SUB_B] } } });
    await prisma.idempotencyKey.deleteMany({ where: { key: IDEM_KEY } });
    await app.close();
  });

  it('rejects swipe without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/deals/${dealIds[0]}/swipes`,
      headers: { 'content-type': 'application/json' },
      payload: { direction: 'right' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('swipe right saves the deal and it appears in saved-deals', async () => {
    const t = await token(SUB_A);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/deals/${dealIds[0]}/swipes`,
      headers: json(t),
      payload: { direction: 'right' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().saved).toBe(true);

    const saved = await app.inject({ method: 'GET', url: '/v1/me/saved-deals', headers: bare(t) });
    expect((saved.json() as DealItem[]).some((d) => d.id === dealIds[0])).toBe(true);
  });

  it('is idempotent with an Idempotency-Key (same swipe id, no double-count)', async () => {
    const t = await token(SUB_A);
    const headers = { ...json(t), 'idempotency-key': IDEM_KEY };
    const r1 = await app.inject({
      method: 'POST',
      url: `/v1/deals/${dealIds[1]}/swipes`,
      headers,
      payload: { direction: 'left' },
    });
    const r2 = await app.inject({
      method: 'POST',
      url: `/v1/deals/${dealIds[1]}/swipes`,
      headers,
      payload: { direction: 'left' },
    });
    expect(r1.json().swipeId).toBe(r2.json().swipeId);

    const user = await prisma.user.findUnique({ where: { supabaseUserId: SUB_A } });
    const count = await prisma.dealSwipe.count({ where: { userId: user!.id, dealId: dealIds[1] } });
    expect(count).toBe(1);
  });

  it('undo restores the prior saved state', async () => {
    const t = await token(SUB_A);
    // dealIds[2] not previously saved → swipe right saves it, undo removes it.
    await app.inject({
      method: 'POST',
      url: `/v1/deals/${dealIds[2]}/swipes`,
      headers: json(t),
      payload: { direction: 'right' },
    });
    const undo = await app.inject({
      method: 'DELETE',
      url: `/v1/deals/${dealIds[2]}/swipes/latest`,
      headers: bare(t),
    });
    expect(undo.statusCode).toBe(200);
    expect(undo.json().saved).toBe(false);

    const saved = await app.inject({ method: 'GET', url: '/v1/me/saved-deals', headers: bare(t) });
    expect((saved.json() as DealItem[]).some((d) => d.id === dealIds[2])).toBe(false);
  });

  it('save/unsave and watch/unwatch are idempotent', async () => {
    const t = await token(SUB_A);
    for (let i = 0; i < 2; i++) {
      const s = await app.inject({
        method: 'POST',
        url: `/v1/deals/${dealIds[3]}/save`,
        headers: bare(t),
      });
      expect(s.json().saved).toBe(true);
      const w = await app.inject({
        method: 'POST',
        url: `/v1/deals/${dealIds[3]}/watch`,
        headers: bare(t),
      });
      expect(w.json().watching).toBe(true);
    }
    const watched = await app.inject({
      method: 'GET',
      url: '/v1/me/watched-deals',
      headers: bare(t),
    });
    expect((watched.json() as DealItem[]).some((d) => d.id === dealIds[3])).toBe(true);
  });

  it('redemption counts savings once', async () => {
    const t = await token(SUB_A);
    const first = await app.inject({
      method: 'POST',
      url: `/v1/deals/${dealIds[0]}/redemptions`,
      headers: bare(t),
    });
    const second = await app.inject({
      method: 'POST',
      url: `/v1/deals/${dealIds[0]}/redemptions`,
      headers: bare(t),
    });
    expect(first.json().counted).toBe(true);
    expect(first.json().savingsAmount).toBeGreaterThan(0);
    expect(second.json().counted).toBe(false);
  });

  it("does not leak another user's saved deals (ownership)", async () => {
    const tb = await token(SUB_B);
    const saved = await app.inject({ method: 'GET', url: '/v1/me/saved-deals', headers: bare(tb) });
    // User B saved nothing → empty, regardless of user A's saves.
    expect((saved.json() as DealItem[]).length).toBe(0);
  });

  it('records a view interaction', async () => {
    const t = await token(SUB_A);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/deals/${dealIds[0]}/views`,
      headers: bare(t),
    });
    expect(res.statusCode).toBe(201);
  });

  it('records impressions and dedupes repeats within the same day', async () => {
    const t = await token(SUB_A);
    const user = await prisma.user.findUnique({ where: { supabaseUserId: SUB_A } });
    const post = () =>
      app.inject({
        method: 'POST',
        url: `/v1/deals/${dealIds[4]}/impressions`,
        headers: json(t),
        payload: { distanceMiles: 2.34, priceMinor: 599, category: 'food', freshnessDays: 1 },
      });
    expect((await post()).statusCode).toBe(201);
    expect((await post()).statusCode).toBe(201);

    const rows = await prisma.dealInteraction.findMany({
      where: { userId: user!.id, dealId: dealIds[4], type: 'impression' },
    });
    expect(rows.length).toBe(1); // deduped
  });

  it('buckets distance and never stores precise coordinates in metadata', async () => {
    const t = await token(SUB_A);
    const user = await prisma.user.findUnique({ where: { supabaseUserId: SUB_A } });
    await app.inject({
      method: 'POST',
      url: `/v1/deals/${dealIds[5]}/opens`,
      headers: json(t),
      payload: { distanceMiles: 2.34, priceMinor: 599, category: 'food' },
    });
    const row = await prisma.dealInteraction.findFirst({
      where: { userId: user!.id, dealId: dealIds[5], type: 'open' },
    });
    const meta = (row?.metadata ?? {}) as Record<string, unknown>;
    expect(meta.distanceMilesBucket).toBe(2.5); // rounded to 0.5mi bucket
    expect(meta).not.toHaveProperty('latitude');
    expect(meta).not.toHaveProperty('longitude');
    expect(meta).not.toHaveProperty('distanceMiles');
  });

  it('rejects precise coordinates in an interaction payload (whitelist)', async () => {
    const t = await token(SUB_A);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/deals/${dealIds[5]}/impressions`,
      headers: json(t),
      payload: { latitude: 33.75, longitude: -84.39 },
    });
    expect(res.statusCode).toBe(400);
  });
});
