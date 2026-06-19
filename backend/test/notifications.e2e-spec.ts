import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { JWKS_RESOLVER } from '../src/auth/auth.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PriceTrackingService } from '../src/notifications/price-tracking.service';
import { LocalPushSender } from '../src/notifications/providers/local-push-sender';

const SUB_A = '55555555-5555-5555-5555-5555555555aa';
const SUB_B = '66666666-6666-6666-6666-6666666666bb';
const SUB_C = '77777777-7777-7777-7777-7777777777cc';

interface WithId {
  id: string;
}

describe('Notifications (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let priceTracking: PriceTrackingService;
  let localSender: LocalPushSender;
  let privateKey: CryptoKey;
  let dealId: string;

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

  /** Ensure the test user's app row exists by hitting /v1/me. Returns its id. */
  async function ensureUser(sub: string): Promise<string> {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: bare(await token(sub)) });
    return res.json().id;
  }

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
    notifications = app.get(NotificationsService);
    priceTracking = app.get(PriceTrackingService);
    localSender = app.get(LocalPushSender);

    await prisma.user.deleteMany({ where: { supabaseUserId: { in: [SUB_A, SUB_B, SUB_C] } } });

    const feed = await app.inject({
      method: 'GET',
      url: '/v1/feeds/nearby?lat=33.7531&lng=-84.3857&radiusMiles=50&limit=5',
    });
    dealId = (feed.json() as { items: WithId[] }).items[0].id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { supabaseUserId: { in: [SUB_A, SUB_B, SUB_C] } } });
    await app.close();
  });

  it('registers and rotates a push token', async () => {
    const t = await token(SUB_A);
    const r1 = await app.inject({
      method: 'POST',
      url: '/v1/push-tokens',
      headers: json(t),
      payload: { token: 'device-token-a', platform: 'ios' },
    });
    expect(r1.statusCode).toBe(201);
    const id1 = (r1.json() as WithId).id;

    // Re-register the same token → same row (rotation, not a duplicate).
    const r2 = await app.inject({
      method: 'POST',
      url: '/v1/push-tokens',
      headers: json(t),
      payload: { token: 'device-token-a', platform: 'ios' },
    });
    expect((r2.json() as WithId).id).toBe(id1);

    const userId = await ensureUser(SUB_A);
    expect(await prisma.pushToken.count({ where: { userId } })).toBe(1);
  });

  it('gets and updates notification preferences', async () => {
    const t = await token(SUB_A);
    const get = await app.inject({
      method: 'GET',
      url: '/v1/me/notification-preferences',
      headers: bare(t),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().priceDrops).toBe(true);

    const put = await app.inject({
      method: 'PUT',
      url: '/v1/me/notification-preferences',
      headers: json(t),
      payload: { sponsored: true, timezone: 'America/New_York' },
    });
    expect(put.json().sponsored).toBe(true);
  });

  it('creates + delivers a notification, lists it, and marks it read', async () => {
    const userId = await ensureUser(SUB_A);
    const before = localSender.sent.length;

    const created = await notifications.createAndSend(userId, {
      type: 'account',
      title: 'Welcome',
      body: 'Thanks for joining Dealy.',
    });
    expect(created).not.toBeNull();
    expect(localSender.sent.length).toBeGreaterThan(before); // pushed to the registered token

    const t = await token(SUB_A);
    const list = await app.inject({ method: 'GET', url: '/v1/notifications', headers: bare(t) });
    expect((list.json() as WithId[]).some((n) => n.id === created!.id)).toBe(true);

    const read = await app.inject({
      method: 'PATCH',
      url: `/v1/notifications/${created!.id}/read`,
      headers: bare(t),
    });
    expect(read.statusCode).toBe(204);
    const after = await prisma.notification.findUnique({ where: { id: created!.id } });
    expect(after?.readAt).not.toBeNull();
  });

  it('respects a disabled preference (returns null)', async () => {
    const userId = await ensureUser(SUB_A);
    await prisma.notificationPreferences.update({ where: { userId }, data: { priceDrops: false } });
    const result = await notifications.createAndSend(userId, {
      type: 'price_drop',
      title: 'x',
      body: 'y',
    });
    expect(result).toBeNull();
  });

  it('dedupes by dedupeKey', async () => {
    const userId = await ensureUser(SUB_A);
    const a = await notifications.createAndSend(userId, {
      type: 'account',
      title: 'Dupe',
      body: 'b',
      dedupeKey: 'dupe-1',
    });
    const b = await notifications.createAndSend(userId, {
      type: 'account',
      title: 'Dupe',
      body: 'b',
      dedupeKey: 'dupe-1',
    });
    expect(a!.id).toBe(b!.id);
  });

  it('cleans up invalid tokens reported by the sender', async () => {
    const userId = await ensureUser(SUB_A);
    await prisma.pushToken.create({
      data: { userId, token: 'invalid-token', platform: 'ios' },
    });
    await notifications.createAndSend(userId, { type: 'account', title: 'Ping', body: 'b' });
    const dead = await prisma.pushToken.findUnique({ where: { token: 'invalid-token' } });
    expect(dead?.invalid).toBe(true);
  });

  it('does not push during quiet hours but still records the notification', async () => {
    const userId = await ensureUser(SUB_C);
    await prisma.pushToken.create({ data: { userId, token: 'token-c', platform: 'ios' } });
    // Quiet window that definitely includes "now" in this timezone.
    const tz = 'America/New_York';
    const hour =
      Number(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(
          new Date(),
        ),
      ) % 24;
    await prisma.notificationPreferences.upsert({
      where: { userId },
      update: { quietHoursStart: hour, quietHoursEnd: (hour + 1) % 24, timezone: tz },
      create: { userId, quietHoursStart: hour, quietHoursEnd: (hour + 1) % 24, timezone: tz },
    });

    const before = localSender.sent.length;
    const created = await notifications.createAndSend(userId, {
      type: 'account',
      title: 'Quiet',
      body: 'b',
    });
    expect(created).not.toBeNull();
    expect(localSender.sent.length).toBe(before); // not pushed
    expect(created!.sentAt).toBeNull();
  });

  it('fires a price-drop notification to a watcher', async () => {
    const userId = await ensureUser(SUB_A);
    // Re-enable price drops (disabled in an earlier test).
    await prisma.notificationPreferences.update({ where: { userId }, data: { priceDrops: true } });
    await prisma.watchedDeal.upsert({
      where: { userId_dealId: { userId, dealId } },
      update: {},
      create: { userId, dealId },
    });
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });

    await priceTracking.recordPriceChange({ id: dealId, title: deal!.title }, 2000n, 1000n);

    const notif = await prisma.notification.findFirst({
      where: { userId, type: 'price_drop', dealId },
    });
    expect(notif).not.toBeNull();
    const history = await prisma.priceHistory.count({ where: { dealId } });
    expect(history).toBeGreaterThan(0);
  });

  it('sweeps expiring saved deals into notifications', async () => {
    const userId = await ensureUser(SUB_A);
    const cat = await prisma.category.findFirst({ where: { slug: 'food' } });
    const soon = await prisma.deal.create({
      data: {
        externalId: 'notif-expiring-1',
        title: 'Expiring Soon Deal',
        merchant: 'M',
        categoryId: cat!.id,
        expiresAt: new Date(Date.now() + 3 * 3_600_000),
        status: 'published',
        source: 'fixture',
      },
    });
    await prisma.savedDeal.create({ data: { userId, dealId: soon.id } });

    const count = await notifications.sweepExpiringSaved(24);
    expect(count).toBeGreaterThanOrEqual(1);
    const notif = await prisma.notification.findFirst({
      where: { userId, type: 'expiring_saved', dealId: soon.id },
    });
    expect(notif).not.toBeNull();

    await prisma.deal.delete({ where: { id: soon.id } });
  });

  it("does not leak another user's notifications", async () => {
    const tb = await token(SUB_B);
    const list = await app.inject({ method: 'GET', url: '/v1/notifications', headers: bare(tb) });
    expect((list.json() as WithId[]).length).toBe(0);
  });
});
