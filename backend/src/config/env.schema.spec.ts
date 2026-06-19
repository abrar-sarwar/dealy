import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('accepts a minimal valid development env and applies defaults', () => {
    const env = validateEnv({ DATABASE_URL: 'postgresql://localhost/dealy' });
    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.APPLE_BUNDLE_ID).toBe('com.dealy.app');
  });

  it('coerces PORT from string to number', () => {
    const env = validateEnv({ DATABASE_URL: 'postgresql://localhost/dealy', PORT: '8080' });
    expect(env.PORT).toBe(8080);
  });

  it('rejects when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('requires Supabase, Redis and Meilisearch in production', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'postgresql://localhost/dealy', APP_ENV: 'production' }),
    ).toThrow(/required when APP_ENV=production/);
  });

  it('passes in production when required production values are present', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://localhost/dealy',
      APP_ENV: 'production',
      SUPABASE_URL: 'https://ref.supabase.co',
      SUPABASE_SECRET_KEY: 'secret',
      SUPABASE_JWKS_URL: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json',
      REDIS_URL: 'redis://localhost:6379',
      MEILISEARCH_HOST: 'http://localhost:7700',
      MEILISEARCH_MASTER_KEY: 'master',
    });
    expect(env.APP_ENV).toBe('production');
  });

  it('treats empty-string optional values as undefined', () => {
    const env = validateEnv({ DATABASE_URL: 'postgresql://localhost/dealy', SENTRY_DSN: '' });
    expect(env.SENTRY_DSN).toBeUndefined();
  });
});
