import { validateEnv, envSchema, autoPublishKinds } from './env.schema';

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
      FIRECRAWL_API_KEY: 'fc',
      GOOGLE_GEMINI_API_KEY: 'gemini',
    });
    expect(env.APP_ENV).toBe('production');
  });

  it('treats empty-string optional values as undefined', () => {
    const env = validateEnv({ DATABASE_URL: 'postgresql://localhost/dealy', SENTRY_DSN: '' });
    expect(env.SENTRY_DSN).toBeUndefined();
  });
});

describe('discovery env', () => {
  it('applies Firecrawl, Gemini, and discovery defaults', () => {
    const env = envSchema.parse({ DATABASE_URL: 'postgres://x' });
    expect(env.FIRECRAWL_MAX_PAGES_PER_RUN).toBe(100);
    expect(env.FIRECRAWL_MAX_CONCURRENCY).toBe(5);
    expect(env.FIRECRAWL_TIMEOUT_MS).toBe(30_000);
    expect(env.GEMINI_MODEL).toBe('gemini-2.5-flash');
    expect(env.GEMINI_REASONING_MODEL).toBe('gemini-2.5-pro');
    expect(env.AI_CACHE_TTL_HOURS).toBe(24);
    expect(env.MIN_LOCAL_DEALS).toBe(25);
    expect(env.LOCAL_DEAL_REFRESH_HOURS).toBe(12);
    expect(env.MAX_DISCOVERY_RUNS_PER_DAY).toBe(4);
    expect(env.CRAWLER_ENABLED).toBe(true);
    expect(env.AI_ENABLED).toBe(true);
  });

  it('requires Firecrawl and Gemini keys in production', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://localhost/dealy',
        APP_ENV: 'production',
        SUPABASE_URL: 'https://ref.supabase.co',
        SUPABASE_SECRET_KEY: 'secret',
        SUPABASE_JWKS_URL: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json',
        REDIS_URL: 'redis://localhost:6379',
        MEILISEARCH_HOST: 'http://localhost:7700',
        MEILISEARCH_MASTER_KEY: 'master',
      }),
    ).toThrow(/FIRECRAWL_API_KEY|required when APP_ENV=production/);
  });
});

describe('crawler env', () => {
  const base = { DATABASE_URL: 'postgres://x' };
  it('defaults auto-publish off and kinds empty', () => {
    const env = envSchema.parse(base);
    expect(env.CRAWLER_AUTOPUBLISH_THRESHOLD).toBeUndefined();
    expect(autoPublishKinds(env)).toEqual([]);
  });
  it('parses threshold and kinds csv', () => {
    const env = envSchema.parse({
      ...base,
      CRAWLER_AUTOPUBLISH_THRESHOLD: '90',
      CRAWLER_AUTOPUBLISH_KINDS: 'grocery_circular, restaurant',
    });
    expect(env.CRAWLER_AUTOPUBLISH_THRESHOLD).toBe(90);
    expect(autoPublishKinds(env)).toEqual(['grocery_circular', 'restaurant']);
  });
  it('rejects an out-of-range threshold', () => {
    expect(() => envSchema.parse({ ...base, CRAWLER_AUTOPUBLISH_THRESHOLD: '150' })).toThrow();
  });
});
