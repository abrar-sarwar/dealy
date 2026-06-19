import { Injectable, NotFoundException } from '@nestjs/common';
import { DealStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexer } from '../search/search-indexer.service';
import { AuditService } from './audit.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchIndexer,
    private readonly audit: AuditService,
  ) {}

  async grantRole(
    actorId: string,
    targetUserId: string,
    role: UserRole,
  ): Promise<{ granted: true; role: UserRole }> {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.userRoleAssignment.upsert({
      where: { userId_role: { userId: targetUserId, role } },
      update: {},
      create: { userId: targetUserId, role },
    });
    await this.audit.log(actorId, 'role.grant', { type: 'user', id: targetUserId }, { role });
    return { granted: true, role };
  }

  async setDealStatus(
    actorId: string,
    dealId: string,
    status: DealStatus,
    action: string,
  ): Promise<{ id: string; status: DealStatus }> {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('Deal not found');
    await this.prisma.deal.update({ where: { id: dealId }, data: { status } });
    // Keep the search index consistent.
    if (status === DealStatus.published) await this.search.upsertDeals([dealId]);
    else await this.search.removeDeal(dealId);
    await this.audit.log(actorId, action, { type: 'deal', id: dealId }, { status });
    return { id: dealId, status };
  }

  listIngestionFailures(limit = 50) {
    return this.prisma.ingestionFailure.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { run: { select: { provider: true, startedAt: true } } },
    });
  }
}
