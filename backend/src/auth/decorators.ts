import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.constants';
import type { AuthUser } from './auth.types';

/** Marks a route/controller as not requiring authentication. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to users holding at least one of the given roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated app user (throws-safe: only valid on guarded routes). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.authUser) {
      throw new Error('CurrentUser used on an unauthenticated route');
    }
    return req.authUser;
  },
);
