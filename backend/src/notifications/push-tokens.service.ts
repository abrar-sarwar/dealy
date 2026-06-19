import { Injectable } from '@nestjs/common';
import type { DevicePlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register/refresh a device token. A token uniquely identifies a device
   * install, so re-registering rotates it to the current user and clears any
   * prior "invalid" flag (handles device hand-off + token refresh).
   */
  async register(userId: string, token: string, platform: DevicePlatform): Promise<{ id: string }> {
    return this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform, invalid: false, lastSeenAt: new Date() },
      create: { userId, token, platform },
      select: { id: true },
    });
  }

  /** Ownership-scoped delete (only removes the caller's own token). */
  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { id, userId } });
  }
}
