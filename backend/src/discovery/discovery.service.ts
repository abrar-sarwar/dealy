import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { discoveryConfig } from '../config/discovery';
import { PrismaService } from '../prisma/prisma.service';
import { shouldTriggerDiscovery, type DiscoveryTriggerDecision } from './discovery-cost';

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async evaluateRegion(regionSlug: string, now = new Date()): Promise<DiscoveryTriggerDecision> {
    const cfg = discoveryConfig(this.config);
    const inventory = await this.prisma.regionalInventory.findUnique({ where: { regionSlug } });
    return shouldTriggerDiscovery({
      enabled: cfg.crawlerEnabled,
      dealCount: inventory?.dealCount ?? 0,
      minLocalDeals: cfg.minLocalDeals,
      lastRefresh: inventory?.lastRefresh ?? null,
      refreshHours: cfg.localDealRefreshHours,
      now,
    });
  }
}
