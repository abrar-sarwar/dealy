import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, SupabaseClaims } from './auth.types';

/**
 * Maps a verified Supabase identity to the app `users` row. Idempotent: the
 * first authenticated request creates the user (+ empty profile/preferences);
 * subsequent requests update the email only. Never trusts client-supplied ids.
 */
@Injectable()
export class UserSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async syncFromClaims(claims: SupabaseClaims): Promise<AuthUser> {
    const email = typeof claims.email === 'string' ? claims.email : null;

    const user = await this.prisma.user.upsert({
      where: { supabaseUserId: claims.sub },
      update: { email: email ?? undefined },
      create: {
        supabaseUserId: claims.sub,
        email,
        profile: { create: {} },
        preferences: { create: {} },
      },
      select: {
        id: true,
        supabaseUserId: true,
        email: true,
        deletedAt: true,
        roles: { select: { role: true } },
      },
    });

    if (user.deletedAt) {
      throw new UnauthorizedException('Account has been deleted');
    }

    return {
      id: user.id,
      supabaseUserId: user.supabaseUserId,
      email: user.email,
      roles: user.roles.map((r) => r.role),
    };
  }
}
