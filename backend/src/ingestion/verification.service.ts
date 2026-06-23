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
  /** A validated, source-refreshed future expiry to persist (confirmed only). */
  expiresAt?: Date;
  /** Whether the deal remains eligible for active feeds after this outcome. */
  shown: boolean;
  reason?: string;
}

/** A refreshed expiry is applied only when it parses and is still in the future. */
function validRefreshedExpiry(expiresAt: Date | undefined, now: Date): Date | undefined {
  if (!expiresAt) return undefined;
  const t = expiresAt.getTime();
  if (Number.isNaN(t) || t <= now.getTime()) return undefined;
  return expiresAt;
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
        // Persist a source-refreshed expiry only when valid + still future.
        // Invalid/missing/past refreshed expiries are ignored (no change).
        expiresAt: validRefreshedExpiry(result.expiresAt, now),
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
      // Only AUTHORITATIVE providers produce verifiable inventory. Editorial /
      // fixture / unknown sources are never promoted to verified by the job.
      if (this.registry.get(source)?.trust !== 'authoritative') continue;
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
    try {
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
      const droppedIds: string[] = [];
      const updatedIds: string[] = [];

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

        try {
          // One transaction per deal so its status update and recorded outcome
          // can never silently diverge.
          await this.prisma.$transaction([
            this.prisma.deal.update({
              where: { id: deal.id },
              data: {
                verificationStatus: decision.verificationStatus,
                ...(decision.dealStatus ? { status: decision.dealStatus } : {}),
                lastVerificationAttemptAt: now,
                ...(decision.lastVerifiedAt ? { lastVerifiedAt: decision.lastVerifiedAt } : {}),
                ...(decision.expiresAt ? { expiresAt: decision.expiresAt } : {}),
                verificationFailureReason: decision.reason ?? null,
              },
            }),
            this.prisma.verificationOutcome.create({
              data: {
                runId: run.id,
                dealId: deal.id,
                externalId: deal.externalId,
                outcome: result.status,
                reason: decision.reason,
              },
            }),
          ]);
        } catch (err) {
          // Per-deal isolation: one deal's DB error must not abort the provider run.
          this.logger.warn(
            `Verification update failed for deal ${deal.id}: ${(err as Error).message}`,
          );
          continue;
        }

        if (!decision.shown) droppedIds.push(deal.id);
        else if (decision.expiresAt) updatedIds.push(deal.id); // still shown, expiry refreshed

        if (result.status === 'confirmed') confirmed++;
        else if (result.status === 'invalid') invalidated++;
        else if (result.status === 'expired') expired++;
        else unreachable++;
      }

      // Keep the search index consistent (best-effort; DB is the source of truth).
      for (const id of droppedIds) {
        try {
          await this.search.removeDeal(id);
        } catch (err) {
          this.logger.warn(`Search removal after verification failed: ${(err as Error).message}`);
        }
      }
      for (const id of updatedIds) {
        try {
          await this.search.upsertDeals([id]);
        } catch (err) {
          this.logger.warn(`Search refresh after verification failed: ${(err as Error).message}`);
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
    } catch (err) {
      // Provider-level failure: finalize the run as failed rather than leaving an
      // abandoned `running` record, then rethrow for caller-level isolation.
      await this.prisma.verificationRun.update({
        where: { id: run.id },
        data: { status: 'failed', error: (err as Error).message, finishedAt: new Date() },
      });
      throw err;
    }
  }

  /**
   * Link-liveness pass for curated student programs. Issues a HEAD (then GET on
   * non-2xx) against each active program's destinationUrl. Healthy (2xx/3xx)
   * clears any prior failure note. Failure flags `verificationFailureReason` for
   * manual review but NEVER archives the deal or promotes it to verified — these
   * are stable, hand-vetted programs and transient link issues must not yank real
   * inventory. `doFetch` is injectable for testing.
   */
  async checkCuratedLinks(
    now = new Date(),
    doFetch: (
      url: string,
      init?: { method: string; redirect: 'follow' },
    ) => Promise<{ ok: boolean; status: number }> = (url, init) =>
      fetch(url, init as RequestInit) as unknown as Promise<{ ok: boolean; status: number }>,
  ): Promise<{ checked: number; flagged: number }> {
    const deals = await this.prisma.deal.findMany({
      where: { status: 'published', source: 'student-programs', destinationUrl: { not: null } },
      select: { id: true, destinationUrl: true },
    });
    let flagged = 0;
    for (const d of deals) {
      const url = d.destinationUrl as string;
      let healthy = false;
      try {
        let r = await doFetch(url, { method: 'HEAD', redirect: 'follow' });
        if (!r.ok) r = await doFetch(url, { method: 'GET', redirect: 'follow' });
        healthy = r.ok;
      } catch {
        healthy = false;
      }
      if (healthy) {
        await this.prisma.deal.update({
          where: { id: d.id },
          data: { lastVerificationAttemptAt: now, verificationFailureReason: null },
        });
      } else {
        flagged++;
        this.logger.warn(`Curated link unhealthy (flagged for review): ${url}`);
        await this.prisma.deal.update({
          where: { id: d.id },
          data: {
            lastVerificationAttemptAt: now,
            verificationFailureReason: `link unreachable: ${url}`,
          },
        });
      }
    }
    return { checked: deals.length, flagged };
  }
}
