import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InteractionType, Prisma, SwipeDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapPrismaDeal } from '../deals/deal.mapper';
import type { DealDto } from '../deals/deal.dto';
import { AnalyticsService } from '../analytics/analytics.service';
import { DealyEvent } from '../analytics/events';

export interface InteractionSignals {
  distanceMiles?: number;
  priceMinor?: number;
  category?: string;
  freshnessDays?: number;
}

/**
 * Build the stored metadata for an interaction. Distance is bucketed to 0.5-mile
 * resolution and precise coordinates are never accepted or stored, so a deal's
 * exact location can't be reconstructed from interaction history (spec §9).
 */
function sanitizeSignals(s?: InteractionSignals): Prisma.InputJsonValue | undefined {
  if (!s) return undefined;
  const out: Record<string, number | string> = {};
  if (s.distanceMiles != null) out.distanceMilesBucket = Math.round(s.distanceMiles * 2) / 2;
  if (s.priceMinor != null) out.priceMinor = Math.round(s.priceMinor);
  if (s.category) out.category = s.category;
  if (s.freshnessDays != null) out.freshnessDays = Math.round(s.freshnessDays);
  return Object.keys(out).length ? out : undefined;
}

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  // --- Swipes (append-only, soft-undo, right-swipe saves) ---

  async swipe(
    userId: string,
    dealId: string,
    direction: SwipeDirection,
    idempotencyKey?: string,
  ): Promise<{ swipeId: string; saved: boolean }> {
    return this.withIdempotency(idempotencyKey, userId, async () => {
      await this.requireDeal(dealId);
      return this.prisma.$transaction(async (tx) => {
        const wasSaved =
          (await tx.savedDeal.findUnique({ where: { userId_dealId: { userId, dealId } } })) !==
          null;
        const swipe = await tx.dealSwipe.create({
          data: { userId, dealId, direction, wasSavedBefore: wasSaved },
        });
        let saved = wasSaved;
        if (direction === SwipeDirection.right && !wasSaved) {
          await tx.savedDeal.create({ data: { userId, dealId } });
          saved = true;
        }
        return { swipeId: swipe.id, saved };
      });
    });
  }

  /** Undo the most recent non-undone swipe for this deal, restoring saved state. */
  async undoLatestSwipe(
    userId: string,
    dealId: string,
  ): Promise<{ restored: true; saved: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.dealSwipe.findFirst({
        where: { userId, dealId, undone: false },
        orderBy: { createdAt: 'desc' },
      });
      if (!last) throw new NotFoundException('No swipe to undo');
      await tx.dealSwipe.update({ where: { id: last.id }, data: { undone: true } });
      if (last.wasSavedBefore) {
        await tx.savedDeal.upsert({
          where: { userId_dealId: { userId, dealId } },
          update: {},
          create: { userId, dealId },
        });
      } else {
        await tx.savedDeal.deleteMany({ where: { userId, dealId } });
      }
      return { restored: true, saved: last.wasSavedBefore };
    });
  }

  // --- Saves / watches (idempotent via composite PK) ---

  async save(userId: string, dealId: string): Promise<{ saved: boolean }> {
    await this.requireDeal(dealId);
    await this.prisma.savedDeal.upsert({
      where: { userId_dealId: { userId, dealId } },
      update: {},
      create: { userId, dealId },
    });
    return { saved: true };
  }

  async unsave(userId: string, dealId: string): Promise<{ saved: boolean }> {
    await this.prisma.savedDeal.deleteMany({ where: { userId, dealId } });
    return { saved: false };
  }

  async watch(userId: string, dealId: string): Promise<{ watching: boolean }> {
    await this.requireDeal(dealId);
    await this.prisma.watchedDeal.upsert({
      where: { userId_dealId: { userId, dealId } },
      update: {},
      create: { userId, dealId },
    });
    return { watching: true };
  }

  async unwatch(userId: string, dealId: string): Promise<{ watching: boolean }> {
    await this.prisma.watchedDeal.deleteMany({ where: { userId, dealId } });
    return { watching: false };
  }

  // --- Lightweight interactions (signals for the later personalization phase) ---

  /**
   * Record an interaction event. Optional `signals` are sanitized (never precise
   * coordinates — distance is bucketed). An optional `dedupeKey` collapses
   * duplicate events (e.g. one impression per user+deal+day). Recording is
   * best-effort: a write failure returns `{ recorded: false }` and never blocks
   * the user experience.
   */
  async recordInteraction(
    userId: string,
    dealId: string,
    type: InteractionType,
    opts?: { signals?: InteractionSignals; dedupeKey?: string },
  ): Promise<{ recorded: boolean }> {
    await this.requireDeal(dealId);
    const metadata = sanitizeSignals(opts?.signals);
    try {
      if (opts?.dedupeKey) {
        // Idempotent: a duplicate (same user + dedupeKey) is a no-op update.
        await this.prisma.dealInteraction.upsert({
          where: { userId_dedupeKey: { userId, dedupeKey: opts.dedupeKey } },
          update: {},
          create: { userId, dealId, type, dedupeKey: opts.dedupeKey, metadata },
        });
      } else {
        await this.prisma.dealInteraction.create({ data: { userId, dealId, type, metadata } });
      }
      return { recorded: true };
    } catch {
      // Tracking is non-critical — never surface a 500 for a missed signal.
      return { recorded: false };
    }
  }

  /** Impression: deduped to one per user+deal+UTC-day. */
  async recordImpression(
    userId: string,
    dealId: string,
    signals?: InteractionSignals,
  ): Promise<{ recorded: boolean }> {
    const day = new Date().toISOString().slice(0, 10);
    return this.recordInteraction(userId, dealId, InteractionType.impression, {
      signals,
      dedupeKey: `impression:${dealId}:${day}`,
    });
  }

  /** Open (deal detail viewed): append-only, carries the same optional signals. */
  async recordOpen(
    userId: string,
    dealId: string,
    signals?: InteractionSignals,
  ): Promise<{ recorded: boolean }> {
    return this.recordInteraction(userId, dealId, InteractionType.open, { signals });
  }

  // --- Redemption (realized savings, counted once per user+deal) ---

  async redeem(
    userId: string,
    dealId: string,
  ): Promise<{ counted: boolean; savingsAmount: number }> {
    const deal = await this.requireDeal(dealId);
    const existing = await this.prisma.dealRedemption.findUnique({
      where: { userId_dealId: { userId, dealId } },
    });
    if (existing) return { counted: false, savingsAmount: Number(existing.savingsMinor) / 100 };

    const savings = (deal.originalPriceMinor ?? 0n) - (deal.currentPriceMinor ?? 0n);
    if (savings <= 0n) return { counted: false, savingsAmount: 0 };

    await this.prisma.dealRedemption.create({
      data: { userId, dealId, savingsMinor: savings, currency: deal.currency },
    });
    const savingsAmount = Number(savings) / 100;
    this.analytics.track(DealyEvent.deal_redeemed, userId, { dealId, savingsAmount });
    return { counted: true, savingsAmount };
  }

  // --- Lists (saved/watched survive even when no longer in the active feed) ---

  async listSaved(userId: string): Promise<DealDto[]> {
    const rows = await this.prisma.savedDeal.findMany({
      where: { userId },
      orderBy: { savedAt: 'desc' },
      include: { deal: { include: { category: true } } },
    });
    return rows.map((r) => mapPrismaDeal(r.deal, null));
  }

  async listWatched(userId: string): Promise<DealDto[]> {
    const rows = await this.prisma.watchedDeal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { deal: { include: { category: true } } },
    });
    return rows.map((r) => mapPrismaDeal(r.deal, null));
  }

  // --- Helpers ---

  private async requireDeal(dealId: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  /**
   * Makes an unsafe POST safe to retry: the first call stores its response under
   * the client-supplied Idempotency-Key; retries return the stored response.
   * (Redis-backed locking is a later hardening; this is correct for low contention.)
   */
  private async withIdempotency<T extends Record<string, unknown>>(
    key: string | undefined,
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!key) return fn();

    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing) {
      if (existing.userId !== userId) {
        throw new ForbiddenException('Idempotency key belongs to another user');
      }
      return (existing.response ?? {}) as T;
    }

    const result = await fn();
    try {
      await this.prisma.idempotencyKey.create({
        data: { key, userId, response: result as unknown as Prisma.InputJsonValue },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await this.prisma.idempotencyKey.findUnique({ where: { key } });
        if (again) return (again.response ?? {}) as T;
      }
      throw err;
    }
    return result;
  }
}
