import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { JWKS_RESOLVER } from '../src/auth/auth.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  APP_STORE_VERIFIER,
  type AppStoreVerifier,
  type DecodedNotification,
  type DecodedTransaction,
} from '../src/subscriptions/app-store-verifier';

const SUB_A = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const SUB_EXP = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const SUB_B = 'aaaaaaaa-0000-4000-8000-0000000000a3';

// Stub verifier: the test controls the decoded payload via the JSON it "signs".
const verifierStub: AppStoreVerifier = {
  verifyTransaction: async (s) => JSON.parse(s) as DecodedTransaction,
  verifyNotification: async (s) => JSON.parse(s) as DecodedNotification,
};

const tx = (over: Partial<DecodedTransaction>): string =>
  JSON.stringify({
    productId: 'dealy.plus.monthly',
    originalTransactionId: 'otx-1',
    transactionId: 'tx-1',
    expiresDateMs: Date.now() + 30 * 86_400_000,
    environment: 'sandbox',
    ...over,
  });

describe('Subscriptions (e2e)', () => {
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

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'e2e', alg: 'RS256', use: 'sig' };
    const jwks = createLocalJWKSet({ keys: [jwk] });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JWKS_RESOLVER)
      .useValue(jwks)
      .overrideProvider(APP_STORE_VERIFIER)
      .useValue(verifierStub)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);

    await prisma.subscription.deleteMany({
      where: { originalTransactionId: { in: ['otx-1', 'otx-2'] } },
    });
    await prisma.user.deleteMany({ where: { supabaseUserId: { in: [SUB_A, SUB_EXP, SUB_B] } } });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({
      where: { originalTransactionId: { in: ['otx-1', 'otx-2'] } },
    });
    await prisma.user.deleteMany({ where: { supabaseUserId: { in: [SUB_A, SUB_EXP, SUB_B] } } });
    await app.close();
  });

  it('requires auth for entitlements', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/entitlements' });
    expect(res.statusCode).toBe(401);
  });

  it('has no entitlement before any purchase', async () => {
    const t = await token(SUB_A);
    const res = await app.inject({ method: 'GET', url: '/v1/me/entitlements', headers: bare(t) });
    expect(res.json().dealyPlus).toBe(false);
  });

  it('grants Dealy+ after syncing an active transaction', async () => {
    const t = await token(SUB_A);
    const sync = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/apple/sync',
      headers: json(t),
      payload: { signedTransactionInfo: tx({}) },
    });
    expect(sync.statusCode).toBe(201);
    expect(sync.json().dealyPlus).toBe(true);
    expect(sync.json().productId).toBe('dealy.plus.monthly');

    const ent = await app.inject({ method: 'GET', url: '/v1/me/entitlements', headers: bare(t) });
    expect(ent.json().dealyPlus).toBe(true);
  });

  it('refuses to reassign a transaction to another account (403)', async () => {
    const tB = await token(SUB_B);
    const steal = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/apple/sync',
      headers: json(tB),
      payload: { signedTransactionInfo: tx({}) }, // same otx-1, owned by SUB_A
    });
    expect(steal.statusCode).toBe(403);

    // Ownership is unchanged and B has no entitlement.
    const sub = await prisma.subscription.findUnique({ where: { originalTransactionId: 'otx-1' } });
    const a = await prisma.user.findUnique({ where: { supabaseUserId: SUB_A } });
    expect(sub!.userId).toBe(a!.id);
    const entB = await app.inject({ method: 'GET', url: '/v1/me/entitlements', headers: bare(tB) });
    expect(entB.json().dealyPlus).toBe(false);
  });

  it('is idempotent (re-sync does not duplicate the event)', async () => {
    const t = await token(SUB_A);
    await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/apple/sync',
      headers: json(t),
      payload: { signedTransactionInfo: tx({}) },
    });
    const sub = await prisma.subscription.findUnique({ where: { originalTransactionId: 'otx-1' } });
    const events = await prisma.subscriptionEvent.count({
      where: { subscriptionId: sub!.id, type: 'sync' },
    });
    expect(events).toBe(1);
  });

  it('revokes entitlement on an EXPIRED webhook', async () => {
    const t = await token(SUB_A);
    const payload = JSON.stringify({
      notificationType: 'EXPIRED',
      transaction: JSON.parse(tx({ transactionId: 'tx-2', expiresDateMs: Date.now() - 1000 })),
    });
    const hook = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/apple',
      headers: { 'content-type': 'application/json' },
      payload: { signedPayload: payload },
    });
    expect(hook.statusCode).toBe(200);

    const ent = await app.inject({ method: 'GET', url: '/v1/me/entitlements', headers: bare(t) });
    expect(ent.json().dealyPlus).toBe(false);
  });

  it('an expired transaction never grants entitlement', async () => {
    const t = await token(SUB_EXP);
    await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/apple/sync',
      headers: json(t),
      payload: {
        signedTransactionInfo: tx({
          originalTransactionId: 'otx-2',
          expiresDateMs: Date.now() - 1000,
        }),
      },
    });
    const ent = await app.inject({ method: 'GET', url: '/v1/me/entitlements', headers: bare(t) });
    expect(ent.json().dealyPlus).toBe(false);
  });
});
