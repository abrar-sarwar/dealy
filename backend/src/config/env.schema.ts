import { z } from 'zod';

/**
 * Typed, validated environment. Required-everywhere values fail fast on boot.
 * Provider credentials are optional and presence-gated so unrelated work runs
 * without them — but they become REQUIRED when APP_ENV=production.
 */
const optionalString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal('').transform(() => undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    API_BASE_URL: z.string().url().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    CORS_ALLOWED_ORIGINS: z.string().default(''),

    // Always required — the app cannot run without a database.
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DIRECT_DATABASE_URL: optionalString,

    // Supabase (required in production).
    SUPABASE_URL: optionalString,
    SUPABASE_PUBLISHABLE_KEY: optionalString,
    SUPABASE_SECRET_KEY: optionalString,
    SUPABASE_JWKS_URL: optionalString,
    SUPABASE_JWT_AUD: z.string().default('authenticated'),
    SUPABASE_STORAGE_BUCKET_DEALS: z.string().default('deal-images'),
    SUPABASE_STORAGE_BUCKET_BUSINESS: z.string().default('business-assets'),

    // Redis / Meilisearch (required in production).
    REDIS_URL: optionalString,
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
    MEILISEARCH_HOST: optionalString,
    MEILISEARCH_MASTER_KEY: optionalString,
    MEILISEARCH_DEALS_INDEX: z.string().default('deals'),

    // Optional integrations — presence-gated, never required.
    GOOGLE_MAPS_SERVER_API_KEY: optionalString,
    FIREBASE_PROJECT_ID: optionalString,
    FIREBASE_SERVICE_ACCOUNT_BASE64: optionalString,
    APPLE_BUNDLE_ID: z.string().default('com.dealy.app'),
    APPLE_ISSUER_ID: optionalString,
    APPLE_KEY_ID: optionalString,
    APPLE_PRIVATE_KEY_BASE64: optionalString,
    /** DER (base64) of "Apple Root CA - G3" — required to verify StoreKit JWS. */
    APPLE_ROOT_CA_BASE64: optionalString,
    APPLE_APPSTORE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
    SENTRY_DSN: optionalString,
    POSTHOG_API_KEY: optionalString,
    POSTHOG_HOST: z.string().default('https://us.i.posthog.com'),
    TICKETMASTER_API_KEY: optionalString,
    EVENTBRITE_TOKEN: optionalString,
    ANTHROPIC_API_KEY: optionalString,
    FIRECRAWL_API_KEY: optionalString,
    GOOGLE_GEMINI_API_KEY: optionalString,
    FIRECRAWL_API_URL: z.string().url().default('https://api.firecrawl.dev'),
    FIRECRAWL_MAX_PAGES_PER_RUN: z.coerce.number().int().positive().default(100),
    FIRECRAWL_MAX_CONCURRENCY: z.coerce.number().int().positive().max(25).default(5),
    FIRECRAWL_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
    GEMINI_REASONING_MODEL: z.string().default('gemini-2.5-pro'),
    AI_CACHE_TTL_HOURS: z.coerce.number().int().positive().default(24),
    MIN_LOCAL_DEALS: z.coerce.number().int().positive().default(25),
    LOCAL_DEAL_REFRESH_HOURS: z.coerce.number().int().positive().default(12),
    MAX_DISCOVERY_RUNS_PER_DAY: z.coerce.number().int().positive().default(4),
    CRAWLER_ENABLED: z.coerce.boolean().default(true),
    AI_ENABLED: z.coerce.boolean().default(true),
    // Crawler / curated pipeline.
    GEOCODER_KEY: optionalString,
    CRAWLER_AUTOPUBLISH_THRESHOLD: z.coerce.number().int().min(1).max(100).optional(),
    CRAWLER_AUTOPUBLISH_KINDS: z.string().default(''),
    /** Force fixture/editorial providers on/off. Default: on outside production. */
    DEALY_ENABLE_FIXTURES: z.enum(['true', 'false']).optional(),
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== 'production') return;
    const requiredInProd: (keyof typeof env)[] = [
      'SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
      'SUPABASE_JWKS_URL',
      'REDIS_URL',
      'MEILISEARCH_HOST',
      'MEILISEARCH_MASTER_KEY',
      'FIRECRAWL_API_KEY',
      'GOOGLE_GEMINI_API_KEY',
    ];
    for (const key of requiredInProd) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${String(key)} is required when APP_ENV=production`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Whether dev/demo fixture + editorial providers are usable. Defaults ON outside
 * production so local dev and tests work, and OFF in production unless explicitly
 * forced — fixture inventory is never silently enabled in staging/production.
 */
export function fixturesEnabled(env: Pick<Env, 'APP_ENV' | 'DEALY_ENABLE_FIXTURES'>): boolean {
  if (env.DEALY_ENABLE_FIXTURES === 'true') return true;
  if (env.DEALY_ENABLE_FIXTURES === 'false') return false;
  return env.APP_ENV !== 'production';
}

/** Parsed CrawlKind allowlist for auto-publish. Empty = no kind is auto-published. */
export function autoPublishKinds(env: Pick<Env, 'CRAWLER_AUTOPUBLISH_KINDS'>): string[] {
  return env.CRAWLER_AUTOPUBLISH_KINDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Used by @nestjs/config `validate`. Throws an actionable error on bad config. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
