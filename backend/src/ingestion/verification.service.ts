import { Injectable, Logger } from '@nestjs/common';
import { DealStatus, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexer } from '../search/search-indexer.service';
import { ProviderRegistry } from './provider-registry';
import type { VerificationResult } from './normalized-deal';

/** Conservative grace for transient provider failures: ~1.5 daily cycles. */
export const VERIFICATION_GRACE_MS = 36 * 60 * 60 * 1000;

export interface DealVerificationState {
  verificationStatus: VerificationStatus;
  lastVerifiedAt: Date | null;
}

export interface VerificationDecision {
  /** New `verification_status` to persist. */
  verificationStatus: VerificationStatus;
  /** New `deal.status` when it must change (invalid -> archived, expired -> expired). */
  dealStatus?: DealStatus;
  /** Set only when the source freshly confirmed the deal. */
  lastVerifiedAt?: Date;
  /** Whether the deal remains eligible for active feeds after this outcome. */
  shown: boolean;
  reason?: string;
}

/**
 * Pure decision for one re-verification outcome. Kept side-effect free so the
 * grace policy is exhaustively unit-testable.
 *
 * Rules (spec §4):
 * - confirmed   -> verified, shown, refresh lastVerifiedAt.
 * - invalid     -> archived + invalid, removed from feeds IMMEDIATELY (terminal).
 * - expired     -> expired, removed IMMEDIATELY (terminal).
 * - unreachable -> keep showing (still `verified`) only while within the grace
 *                  window measured from the last real confirmation; once grace is
 *                  exhausted, mark `unreachable` and drop from feeds. A transient
 *                  failure NEVER overrides a source-confirmed invalid/expired.
 */
export function resolveVerification(
  current: DealVerificationState,
  result: VerificationResult,
  now: Date,
  graceMs: number = VERIFICATION_GRACE_MS,
): VerificationDecision {
  switch (result.status) {
    case 'confirmed':
      return {
        verificationStatus: VerificationStatus.verified,
        dealStatus: DealStatus.published,
        lastVerifiedAt: now,
        shown: true,
      };
    case 'invalid':
      return {
        verificationStatus: VerificationStatus.invalid,
        dealStatus: DealStatus.archived,
        shown: false,
        reason: result.reason ?? 'source no longer confirms the offer',
      };
    case 'expired':
      return {
        verificationStatus: VerificationStatus.expired,
        dealStatus: DealStatus.expired,
        shown: false,
        reason: result.reason ?? 'source marked the offer expired',
      };
    case 'unreachable': {
      const last = current.lastVerifiedAt?.getTime();
      const withinGrace = last !== undefined && now.getTime() - last <= graceMs;
      return withinGrace
        ? {
            verificationStatus: VerificationStatus.verified,
            shown: true,
            reason: result.reason ?? 'provider temporarily unreachable (within grace)',
          }
        : {
            verificationStatus: VerificationStatus.unreachable,
            shown: false,
            reason: result.reason ?? 'provider unreachable beyond grace window',
          };
    }
  }
}

export interface VerificationRunSummary {
  runId: string;
  provider: string;
  status: 'succeeded' | 'failed';
  checked: number;
  confirmed: number;
  invalidated: number;
  expired: number;
  unreachable: number;
  error?: string;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly search: SearchIndexer,
  ) {}

  /**
   * Re-verify every active deal, grouped by source provider. Each provider runs
   * independently: one provider failing (or missing/uninstrumented) never stops
   * the others. Returns a per-provider summary for operational monitoring.
   */
  async verifyAll(
    now = new Date(),
    graceMs = VERIFICATION_GRACE_MS,
  ): Promise<VerificationRunSummary[]> {
    const providers = await this.prisma.deal.groupBy({
      by: ['source'],
      where: { status: 'published' },
      _count: true,
    });
    const summaries: VerificationRunSummary[] = [];
    for (const { source } of providers) {
      try {
        summaries.push(await this.verifyProvider(source, now, graceMs));
      } catch (err) {
        // Provider-level isolation: log and continue with the next provider.
        this.logger.error(`Verification provider "${source}" crashed: ${(err as Error).message}`);
        summaries.push({
          runId: '',
          provider: source,
          status: 'failed',
          checked: 0,
          confirmed: 0,
          invalidated: 0,
          expired: 0,
          unreachable: 0,
          error: (err as Error).message,
        });
      }
    }
    return summaries;
  }

  async verifyProvider(
    source: string,
    now = new Date(),
    graceMs = VERIFICATION_GRACE_MS,
  ): Promise<VerificationRunSummary> {
    const run = await this.prisma.verificationRun.create({ data: { provider: source } });
    const provider = this.registry.get(source);

    const deals = await this.prisma.deal.findMany({
      where: { status: 'published', source },
      select: {
        id: true,
        externalId: true,
        expiresAt: true,
        verificationStatus: true,
        lastVerifiedAt: true,
      },
    });

    let confirmed = 0;
    let invalidated = 0;
    let expired = 0;
    let unreachable = 0;
    const changedIds: string[] = [];

    for (const deal of deals) {
      let result: VerificationResult;
      try {
        // No registered provider / no verify() -> we cannot confirm; treat as a
        // transient failure so the grace policy (not an immediate drop) applies.
        result =
          provider?.verify && deal.externalId
            ? await provider.verify({ externalId: deal.externalId, expiresAt: deal.expiresAt })
            : { status: 'unreachable', reason: 'no verifying provider registered' };
      } catch (err) {
        result = { status: 'unreachable', reason: (err as Error).message };
      }

      const decision = resolveVerification(
        { verificationStatus: deal.verificationStatus, lastVerifiedAt: deal.lastVerifiedAt },
        result,
        now,
        graceMs,
      );

      await this.prisma.deal.update({
        where: { id: deal.id },
        data: {
          verificationStatus: decision.verificationStatus,
          ...(decision.dealStatus ? { status: decision.dealStatus } : {}),
          lastVerificationAttemptAt: now,
          ...(decision.lastVerifiedAt ? { lastVerifiedAt: decision.lastVerifiedAt } : {}),
          verificationFailureReason: decision.reason ?? null,
        },
      });
      await this.prisma.verificationOutcome.create({
        data: {
          runId: run.id,
          dealId: deal.id,
          externalId: deal.externalId,
          outcome: result.status,
          reason: decision.reason,
        },
      });
      if (!decision.shown) changedIds.push(deal.id);

      if (result.status === 'confirmed') confirmed++;
      else if (result.status === 'invalid') invalidated++;
      else if (result.status === 'expired') expired++;
      else unreachable++;
    }

    // Deals that left the active set must leave the search index too (best-effort).
    for (const id of changedIds) {
      try {
        await this.search.removeDeal(id);
      } catch (err) {
        this.logger.warn(`Search removal after verification failed: ${(err as Error).message}`);
      }
    }

    await this.prisma.verificationRun.update({
      where: { id: run.id },
      data: {
        status: 'succeeded',
        checked: deals.length,
        confirmed,
        invalidated,
        expired,
        unreachable,
        finishedAt: now,
      },
    });
    this.logger.log(
      `Verify ${source}: checked=${deals.length} confirmed=${confirmed} invalid=${invalidated} expired=${expired} unreachable=${unreachable}`,
    );
    return {
      runId: run.id,
      provider: source,
      status: 'succeeded',
      checked: deals.length,
      confirmed,
      invalidated,
      expired,
      unreachable,
    };
  }
}
