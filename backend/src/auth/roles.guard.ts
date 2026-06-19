import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { ROLES_KEY } from './auth.constants';

/**
 * Enforces `@Roles(...)` using the SERVER-controlled role table (loaded into
 * `req.authUser.roles` by user sync) — never JWT metadata. Runs after AuthGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const user = req.authUser;
    if (!user) throw new UnauthorizedException();
    if (!user.roles.some((role) => required.includes(role))) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
