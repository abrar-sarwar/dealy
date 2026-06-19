import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DependencyHealth {
  name: string;
  status: 'up' | 'down';
  error?: string;
}

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: DependencyHealth[];
}

/**
 * Aggregates dependency health for the readiness probe. Each dependency is
 * checked independently so one failure doesn't mask the others. Redis and
 * Meilisearch checks are added with their modules in later phases.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async checkDatabase(): Promise<DependencyHealth> {
    try {
      await this.prisma.ping();
      return { name: 'database', status: 'up' };
    } catch (err) {
      return { name: 'database', status: 'down', error: (err as Error).message };
    }
  }

  async readiness(): Promise<ReadinessReport> {
    const checks = await Promise.all([this.checkDatabase()]);
    const status = checks.every((c) => c.status === 'up') ? 'ok' : 'degraded';
    return { status, checks };
  }
}
