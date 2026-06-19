import { Controller, Get, HttpCode, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '../auth/decorators';
import { HealthService } from './health.service';

/**
 * Health endpoints are intentionally unversioned and unauthenticated so load
 * balancers / Railway / uptime checks can reach them.
 */
@ApiTags('health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe — process is up' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness alias' })
  root(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — dependencies reachable' })
  async ready(@Res() reply: FastifyReply): Promise<void> {
    const report = await this.health.readiness();
    const code = report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    await reply.status(code).send(report);
  }
}
