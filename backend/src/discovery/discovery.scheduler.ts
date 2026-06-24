import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../config/env.schema';
import { discoveryConfig } from '../config/discovery';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryRunnerService, type DiscoveryRunSummary } from './discovery-runner.service';
import { CandidatePromotionService } from './candidate-promotion.service';

export type RegionOutcome = DiscoveryRunSummary & { promoted: number };

/** In-process cron. Run/page caps are enforced inside runRegion via
 *  evaluateRegion + the budget service; nothing here touches a user request. */
@Injectable()
export class DiscoverySchedulerService {
  private readonly logger = new Logger(DiscoverySchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: DiscoveryRunnerService,
    private readonly promotion: CandidatePromotionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(process.env.DISCOVERY_CRON ?? '0 */6 * * *')
  async scheduled(): Promise<void> {
    if (!discoveryConfig(this.config).crawlerEnabled) return;
    const out = await this.tick();
    this.logger.log({ regions: out.length, promoted: out.reduce((n, r) => n + r.promoted, 0) }, 'discovery.cron.tick');
  }

  async tick(): Promise<RegionOutcome[]> {
    const regions = await this.prisma.regionalInventory.findMany({ select: { regionSlug: true } });
    const out: RegionOutcome[] = [];
    for (const r of regions) {
      try {
        const summary = await this.runner.runRegion(r.regionSlug);
        const { promoted } = await this.promotion.promoteRegion(r.regionSlug);
        out.push({ ...summary, promoted });
      } catch (err) {
        this.logger.error({ regionSlug: r.regionSlug, err: (err as Error).message }, 'discovery.region.failed');
      }
    }
    return out;
  }
}
