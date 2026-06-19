import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../config/env.schema';
import { JWKS_RESOLVER } from './auth.constants';

/** A jose key resolver — satisfied by both remote and local JWK sets. */
export type JwksResolver = JWTVerifyGetKey | null;

/**
 * Builds the remote JWKS resolver from `SUPABASE_JWKS_URL`. Returns `null` when
 * unconfigured (local dev without Supabase) — auth then fails closed with 503,
 * and tests override this provider with a local key set.
 */
export const jwksResolverProvider = {
  provide: JWKS_RESOLVER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): JwksResolver => {
    const url = config.get('SUPABASE_JWKS_URL', { infer: true });
    if (!url) {
      new Logger('JwksResolver').warn(
        'SUPABASE_JWKS_URL not set — auth is disabled (fails closed). Set it for real Supabase tokens.',
      );
      return null;
    }
    return createRemoteJWKSet(new URL(url));
  },
};
