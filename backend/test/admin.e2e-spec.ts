import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { JWKS_RESOLVER } from '../src/auth/auth.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedAuthoritativeNearby } from './helpers';

const SUB_ADMIN = 'bbbbbbbb-0000-4000-8000-0000000000b1';
const SUB_USER = 'bbbbbbbb-0000-4000-8000-0000000000b2';

describe('Admin (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
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
  const bare = (t: string) => ({ authorization: `Bearer ${t}` });
  const json = (t: string) => ({
    authorization: `Bearer ${t}`,
    'content-type': 'application/json',
  });

  async function userId(sub: string): Promise<string> {
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

    await prisma.user.deleteMany({ where: { supabaseUserId: { in: [SUB_ADMIN, SUB_USER] } } });
    await prisma.deal.deleteMany({ where: { source: 'e2e-admin' } });
    const [seededId] = await seedAuthoritativeNearby(prisma, { source: 'e2e-admin', count: 1 });
    dealId = seededId;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { supabaseUserId: { in: [SUB_ADMIN, SUB_USER] } } });
    await prisma.deal.deleteMany({ where: { source: 'e2e-admin' } });
    await app.close();
  });

  it('forbids a non-admin from admin routes (403)', async () => {
    const t = await token(SUB_USER);
    const res = await app.inject({ method: 'GET', url: '/v1/admin/audit-logs', headers: bare(t) });
    expect(res.statusCode).toBe(403);
  });

  it('allows an admin (role loaded from the server table, not the JWT)', async () => {
    const adminId = await userId(SUB_ADMIN);
    await prisma.userRoleAssignment.create({ data: { userId: adminId, role: 'admin' } });

    const t = await token(SUB_ADMIN);
    const res = await app.inject({ method: 'GET', url: '/v1/admin/audit-logs', headers: bare(t) });
    expect(res.statusCode).toBe(200);
  });

  it('grants a role and records an audit log', async () => {
    const targetId = await userId(SUB_USER);
    const t = await token(SUB_ADMIN);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${targetId}/roles`,
      headers: json(t),
      payload: { role: 'moderator' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().role).toBe('moderator');

    const role = await prisma.userRoleAssignment.findFirst({
      where: { userId: targetId, role: 'moderator' },
    });
    expect(role).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'role.grant', targetId },
    });
    expect(audit).not.toBeNull();
  });

  it('unpublishes/publishes a deal (audited)', async () => {
    const t = await token(SUB_ADMIN);
    const un = await app.inject({
      method: 'POST',
      url: `/v1/admin/deals/${dealId}/unpublish`,
      headers: bare(t),
    });
    expect(un.statusCode).toBe(201);
    expect(un.json().status).toBe('archived');
    let deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.status).toBe('archived');

    const pub = await app.inject({
      method: 'POST',
      url: `/v1/admin/deals/${dealId}/publish`,
      headers: bare(t),
    });
    expect(pub.json().status).toBe('published');
    deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.status).toBe('published');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'deal.publish', targetId: dealId },
    });
    expect(audit).not.toBeNull();
  });
});
