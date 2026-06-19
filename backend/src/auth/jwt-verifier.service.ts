import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';
import type { Env } from '../config/env.schema';
import { JWKS_RESOLVER } from './auth.constants';
import type { JwksResolver } from './jwks.provider';
import type { SupabaseClaims } from './auth.types';

/**
 * Verifies Supabase access tokens (asymmetric RS256/ES256) against the project
 * JWKS. Audience is enforced; issuer is enforced when SUPABASE_URL is set.
 * We trust ONLY the cryptographically-verified claims — never client metadata.
 */
@Injectable()
export class JwtVerifierService {
  private readonly audience: string;
  private readonly issuer?: string;

  constructor(
    @Inject(JWKS_RESOLVER) private readonly jwks: JwksResolver,
    config: ConfigService<Env, true>,
  ) {
    this.audience = config.get('SUPABASE_JWT_AUD', { infer: true });
    const supabaseUrl = config.get('SUPABASE_URL', { infer: true });
    this.issuer = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1` : undefined;
  }

  async verify(token: string): Promise<SupabaseClaims> {
    if (!this.jwks) {
      throw new ServiceUnavailableException('Authentication is not configured');
    }
    const { payload } = await jwtVerify(token, this.jwks, {
      audience: this.audience,
      ...(this.issuer ? { issuer: this.issuer } : {}),
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('Token missing subject');
    }
    return payload as SupabaseClaims;
  }
}
