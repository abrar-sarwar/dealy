import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { Env } from '../../config/env.schema';
import { TokenBucketLimiter } from './token-bucket';

/**
 * Lightweight in-memory, per-IP token-bucket throttle for the expensive
 * generation endpoints (Smart Basket generate/regenerate, Food Run). Returns
 * 429 when a client exceeds its budget. Single-process only.
 *
 * TODO(auth): swap for @fastify/rate-limit + Redis in multi-instance prod; gate
 * Save + per-user limits once iOS auth lands.
 */
@Injectable()
export class GenerationThrottleGuard implements CanActivate {
  private readonly logger = new Logger(GenerationThrottleGuard.name);
  private readonly limiter: TokenBucketLimiter;

  constructor(config: ConfigService<Env, true>) {
    this.limiter = new TokenBucketLimiter(
      config.get('GEN_RATE_LIMIT_PER_MIN', { infer: true }),
      config.get('GEN_RATE_LIMIT_BURST', { infer: true }),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const ip = req.ip || 'unknown';
    if (this.limiter.tryConsume(ip)) return true;
    this.logger.warn({ ip, path: req.url }, 'generation request throttled (429)');
    throw new HttpException(
      'Too many generation requests — please slow down and try again shortly.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
