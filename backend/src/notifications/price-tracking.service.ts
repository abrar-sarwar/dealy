import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class PriceTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Record a price change for a deal and, on a DROP, notify everyone who saved
   * or watched it. Called by ingestion whenever a deal's price changes.
   */
  async recordPriceChange(
    deal: { id: string; title: string },
    oldMinor: bigint | null,
    newMinor: bigint | null,
  ): Promise<void> {
    if (oldMinor === newMinor) return;

    await this.prisma.priceHistory.create({
      data: { dealId: deal.id, priceMinor: newMinor ?? 0n },
    });

    const isDrop = oldMinor !== null && newMinor !== null && newMinor < oldMinor;
    if (!isDrop) return;

    const [watchers, savers] = await Promise.all([
      this.prisma.watchedDeal.findMany({ where: { dealId: deal.id }, select: { userId: true } }),
      this.prisma.savedDeal.findMany({ where: { dealId: deal.id }, select: { userId: true } }),
    ]);
    const userIds = [...new Set([...watchers, ...savers].map((r) => r.userId))];
    const price = (Number(newMinor) / 100).toFixed(2);

    for (const userId of userIds) {
      await this.notifications.createAndSend(userId, {
        type: 'price_drop',
        title: 'Price drop!',
        body: `${deal.title} dropped to $${price}.`,
        dealId: deal.id,
        dedupeKey: `price_drop:${deal.id}:${newMinor}`,
      });
    }
  }
}
