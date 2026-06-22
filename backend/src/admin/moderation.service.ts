import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexer } from '../search/search-indexer.service';
import { AuditService } from './audit.service';

export interface ModerationEdit {
  title?: string; merchant?: string; categoryId?: string;
  latitude?: number; longitude?: number; startAt?: string; expiresAt?: string;
}

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchIndexer,
    private readonly audit: AuditService,
  ) {}

  /** Pending curated candidates, highest confidence first. */
  queue(opts: { source?: string; category?: string; limit?: number } = {}) {
    return this.prisma.deal.findMany({
      where: {
        moderationStatus: 'pending',
        sourceTrust: 'editorial',
        ...(opts.source ? { crawlSourceId: opts.source } : {}),
        ...(opts.category ? { category: { slug: opts.category } } : {}),
      },
      orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
      take: opts.limit ?? 50,
      include: { category: { select: { slug: true } }, crawlSource: { select: { url: true, kind: true } } },
    });
  }

  async approve(actorId: string, dealId: string): Promise<{ id: string; status: 'published' }> {
    await this.requireDeal(dealId);
    await this.prisma.deal.update({
      where: { id: dealId }, data: { status: 'published', moderationStatus: 'approved' },
    });
    await this.search.upsertDeals([dealId]);
    await this.audit.log(actorId, 'deal.moderate.approve', { type: 'deal', id: dealId }, {});
    return { id: dealId, status: 'published' };
  }

  async reject(actorId: string, dealId: string, reason: string): Promise<{ id: string; status: 'archived' }> {
    await this.requireDeal(dealId);
    await this.prisma.deal.update({
      where: { id: dealId }, data: { status: 'archived', moderationStatus: 'rejected' },
    });
    await this.search.removeDeal(dealId);
    await this.audit.log(actorId, 'deal.moderate.reject', { type: 'deal', id: dealId }, { reason });
    return { id: dealId, status: 'archived' };
  }

  async edit(actorId: string, dealId: string, patch: ModerationEdit): Promise<{ id: string }> {
    const before = await this.requireDeal(dealId);
    const data: Prisma.DealUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.merchant !== undefined) data.merchant = patch.merchant;
    if (patch.categoryId !== undefined) data.category = { connect: { id: patch.categoryId } };
    if (patch.latitude !== undefined) data.latitude = patch.latitude;
    if (patch.longitude !== undefined) data.longitude = patch.longitude;
    if (patch.startAt !== undefined) data.startAt = new Date(patch.startAt);
    if (patch.expiresAt !== undefined) data.expiresAt = new Date(patch.expiresAt);
    await this.prisma.deal.update({ where: { id: dealId }, data });
    await this.audit.log(actorId, 'deal.moderate.edit', { type: 'deal', id: dealId },
      { before: { title: before.title, latitude: before.latitude }, patch });
    return { id: dealId };
  }

  private async requireDeal(id: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }
}
