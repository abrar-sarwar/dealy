import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  type Notification,
  type NotificationPreferences,
  type NotificationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUSH_SENDER, type PushSender } from './push-sender';
import type { UpdateNotificationPrefsDto } from './notifications.dto';

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  dealId?: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  // --- Preferences ---

  getPreferences(userId: string): Promise<NotificationPreferences> {
    return this.prisma.notificationPreferences.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  updatePreferences(
    userId: string,
    dto: UpdateNotificationPrefsDto,
  ): Promise<NotificationPreferences> {
    return this.prisma.notificationPreferences.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
  }

  // --- Inbox ---

  list(userId: string, limit = 30): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  // --- Create + deliver (respects prefs, quiet hours, dedupe) ---

  async createAndSend(
    userId: string,
    input: CreateNotificationInput,
  ): Promise<Notification | null> {
    const prefs = await this.getPreferences(userId);
    if (!this.typeEnabled(prefs, input.type)) return null;

    if (input.dedupeKey) {
      const existing = await this.findByDedupe(userId, input.dedupeKey);
      if (existing) return existing;
    }

    let notif: Notification;
    try {
      notif = await this.prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          dealId: input.dealId ?? null,
          data: (input.data as Prisma.InputJsonValue) ?? undefined,
          dedupeKey: input.dedupeKey ?? null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        input.dedupeKey
      ) {
        const existing = await this.findByDedupe(userId, input.dedupeKey);
        if (existing) return existing;
      }
      throw err;
    }

    // Don't push during quiet hours; the notification still lands in the inbox.
    if (!this.inQuietHours(prefs)) await this.deliver(notif);
    return notif;
  }

  private async deliver(notif: Notification): Promise<void> {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: notif.userId, invalid: false },
    });
    if (tokens.length === 0) return;

    const data: Record<string, string> = { notificationId: notif.id, type: notif.type };
    if (notif.dealId) data.dealId = notif.dealId;

    const results = await this.sender.send(
      tokens.map((t) => ({ token: t.token, title: notif.title, body: notif.body, data })),
    );

    const invalid = results.filter((r) => r.invalidToken).map((r) => r.token);
    if (invalid.length > 0) {
      await this.prisma.pushToken.updateMany({
        where: { token: { in: invalid } },
        data: { invalid: true },
      });
    }
    await this.prisma.notification.update({
      where: { id: notif.id },
      data: { sentAt: new Date() },
    });
  }

  /** Worker sweep: alert users whose saved deals expire within `withinHours`. */
  async sweepExpiringSaved(withinHours = 24): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + withinHours * 3_600_000);
    const saved = await this.prisma.savedDeal.findMany({
      where: { deal: { status: 'published', expiresAt: { gt: now, lte: cutoff } } },
      include: { deal: { select: { id: true, title: true } } },
    });

    let created = 0;
    for (const s of saved) {
      const n = await this.createAndSend(s.userId, {
        type: 'expiring_saved',
        title: 'Ending soon',
        body: `${s.deal.title} ends soon — grab it before it's gone.`,
        dealId: s.dealId,
        dedupeKey: `expiring:${s.dealId}`,
      });
      if (n) created++;
    }
    if (created > 0) this.logger.log(`Expiring-saved sweep created ${created} notifications.`);
    return created;
  }

  // --- Helpers ---

  private findByDedupe(userId: string, dedupeKey: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey } },
    });
  }

  private typeEnabled(prefs: NotificationPreferences, type: NotificationType): boolean {
    switch (type) {
      case 'new_nearby_deal':
        return prefs.newNearbyDeals;
      case 'price_drop':
        return prefs.priceDrops;
      case 'expiring_saved':
        return prefs.expiringSaved;
      case 'watched_update':
        return prefs.watchedUpdates;
      case 'student_deal':
        return prefs.studentDeals;
      case 'event_reminder':
        return prefs.eventReminders;
      case 'sponsored':
        return prefs.sponsored;
      case 'account':
        return true;
    }
  }

  private inQuietHours(prefs: NotificationPreferences, now = new Date()): boolean {
    if (prefs.quietHoursStart === null || prefs.quietHoursEnd === null) return false;
    const hour =
      Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: prefs.timezone,
          hour: 'numeric',
          hour12: false,
        }).format(now),
      ) % 24;
    const { quietHoursStart: start, quietHoursEnd: end } = prefs;
    return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
  }
}
