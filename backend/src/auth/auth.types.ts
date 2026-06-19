import type { JWTPayload } from 'jose';
import type { UserRole } from '@prisma/client';

/** Verified Supabase access-token claims. `sub` is the Supabase auth user id. */
export interface SupabaseClaims extends JWTPayload {
  sub: string;
  email?: string;
  /** Supabase puts a coarse role here, but we NEVER use it for authorization. */
  role?: string;
}

/** The synced app user attached to each authenticated request. */
export interface AuthUser {
  id: string;
  supabaseUserId: string;
  email: string | null;
  roles: UserRole[];
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
    authClaims?: SupabaseClaims;
  }
}
