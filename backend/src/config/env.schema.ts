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
