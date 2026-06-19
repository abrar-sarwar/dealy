import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { JwtVerifierService } from './jwt-verifier.service';
import type { JwksResolver } from './jwks.provider';

function fakeConfig(values: Partial<Record<keyof Env, unknown>>): ConfigService<Env, true> {
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

describe('JwtVerifierService', () => {
  let privateKey: CryptoKey;
  let jwks: JwksResolver;
  let verifier: JwtVerifierService;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    const jwk: JWK = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'test',
      alg: 'RS256',
      use: 'sig',
    };
    jwks = createLocalJWKSet({ keys: [jwk] });
    verifier = new JwtVerifierService(
      jwks,
      fakeConfig({ SUPABASE_JWT_AUD: 'authenticated', SUPABASE_URL: undefined }),
    );
  });

  const sign = (claims: Record<string, unknown>, aud = 'authenticated', expSecondsFromNow = 300) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + expSecondsFromNow)
      .setAudience(aud)
      .sign(privateKey);

  it('verifies a valid token and returns its claims', async () => {
    const token = await sign({ sub: 'user-123', email: 'a@dealy.app' });
    const claims = await verifier.verify(token);
    expect(claims.sub).toBe('user-123');
    expect(claims.email).toBe('a@dealy.app');
  });

  it('rejects a tampered signature', async () => {
    const token = await sign({ sub: 'user-123' });
    await expect(verifier.verify(`${token.slice(0, -4)}aaaa`)).rejects.toBeDefined();
  });

  it('rejects the wrong audience', async () => {
    const token = await sign({ sub: 'user-123' }, 'some-other-aud');
    await expect(verifier.verify(token)).rejects.toBeDefined();
  });

  it('rejects an expired token', async () => {
    const token = await sign({ sub: 'user-123' }, 'authenticated', -60);
    await expect(verifier.verify(token)).rejects.toBeDefined();
  });

  it('fails closed (503) when JWKS is not configured', async () => {
    const unconfigured = new JwtVerifierService(
      null,
      fakeConfig({ SUPABASE_JWT_AUD: 'authenticated' }),
    );
    await expect(unconfigured.verify('x.y.z')).rejects.toThrow(/not configured/i);
  });
});
