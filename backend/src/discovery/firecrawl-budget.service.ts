import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import {
  evaluateFirecrawlBudget,
  type BudgetDecision,
  type FirecrawlBudgetLimits,
  type FirecrawlBudgetUsage,
} from './discovery-budget';

function startOfUtcDay(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Single source of truth for Firecrawl usage. Reads today's counts from the
 *  existing crawl_runs ledger (reuse, not a parallel table) and applies the
 *  pure caps. recrawlsForSourceToday counts this source's runs flagged
 *  unchanged=true today. */
@Injectable()
export class FirecrawlBudgetService {
  constructor(
    private readonly prisma: Pick<PrismaService, 'crawlRun'>,
    private readonly limits: FirecrawlBudgetLimits,
  ) {}

  async usageToday(sourceId: string, now = new Date()): Promise<FirecrawlBudgetUsage> {
    const since = startOfUtcDay(now);
    const [globalPages, sourcePages, recrawls] = await Promise.all([
      this.prisma.crawlRun.aggregate({
        _sum: { firecrawlPages: true },
        where: { startedAt: { gte: since } },
      }),
      this.prisma.crawlRun.aggregate({
        _sum: { firecrawlPages: true },
        where: { startedAt: { gte: since }, source: { id: sourceId } },
      }),
      this.prisma.crawlRun.count({
        where: { startedAt: { gte: since }, source: { id: sourceId }, unchanged: true },
      }),
    ]);
    return {
      pagesToday: globalPages._sum.firecrawlPages ?? 0,
      pagesForSourceToday: sourcePages._sum.firecrawlPages ?? 0,
      recrawlsForSourceToday: recrawls,
    };
  }

  async check(
    sourceId: string,
    opts: { sourceMayBeUnchanged: boolean },
    now = new Date(),
  ): Promise<BudgetDecision> {
    const usage = await this.usageToday(sourceId, now);
    return evaluateFirecrawlBudget(usage, this.limits, opts);
  }
}
