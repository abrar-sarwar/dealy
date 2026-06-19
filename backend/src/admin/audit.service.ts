import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    actorUserId: string | null,
    action: string,
    target?: { type?: string; id?: string },
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actorUserId ?? undefined,
        action,
        targetType: target?.type,
        targetId: target?.id,
        metadata: (metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  list(limit = 50) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
