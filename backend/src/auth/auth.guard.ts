import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from './auth.constants';
import { JwtVerifierService } from './jwt-verifier.service';
import { UserSyncService } from './user-sync.service';

/**
 * Global authentication guard. Every route requires a valid Supabase bearer
 * token unless marked `@Public()`. On success the synced app user is attached
 * to the request. Fails closed.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifierService,
    private readonly userSync: UserSyncService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers['authorization'];
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let claims;
    try {
      claims = await this.verifier.verify(token);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.authUser = await this.userSync.syncFromClaims(claims);
    req.authClaims = claims;
    return true;
  }
}
