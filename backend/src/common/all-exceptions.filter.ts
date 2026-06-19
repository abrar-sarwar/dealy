import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface NestErrorBody {
  message?: string | string[];
  error?: string;
}

/**
 * Uniform error envelope: `{ error: { code, message, requestId, statusCode } }`.
 * 5xx are logged + reported to Sentry (no-op if uninitialised) and never leak
 * internals — clients get a generic message; details stay in logs.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = req.id;

    let code = 'internal_error';
    let message = 'Internal server error';

    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as NestErrorBody;
        message = Array.isArray(obj.message) ? obj.message.join('; ') : (obj.message ?? message);
        code = (obj.error ?? `http_${status}`).toString().toLowerCase().replace(/\s+/g, '_');
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${status} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      Sentry.captureException(exception);
      // Never expose internals on 5xx.
      code = 'internal_error';
      message = 'Internal server error';
    }

    void reply.status(status).send({ error: { code, message, requestId, statusCode: status } });
  }
}
