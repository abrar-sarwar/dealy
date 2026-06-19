import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  APP_STORE_VERIFIER,
  type AppStoreVerifier,
  type DecodedTransaction,
} from './app-store-verifier';

export interface Entitlements {
  dealyPlus: boolean;
  productId?: string;
  expiresAt?: string | null;
  environment?: string;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_STORE_VERIFIER) private readonly verifier: AppStoreVerifier,
  ) {}

  /** Verify a StoreKit transaction and return the server-computed entitlement. */
  async syncTransaction(userId: string, signedTransactionInfo: string): Promise<Entitlements> {
    const tx = await this.verifier.verifyTransaction(signedTransactionInfo);
    await this.applyTransaction(userId, tx, 'sync');
    return this.entitlements(userId);
  }

  /** App Store Server Notification v2 webhook (renew/expire/refund/revoke). */
  async handleNotification(signedPayload: string): Promise<void> {
    const note = await this.verifier.verifyNotification(signedPayload);
    if (!note.transaction) return;

    const sub = await this.prisma.subscription.findUnique({
      where: { originalTransactionId: note.transaction.originalTransactionId },
    });
    if (!sub) {
      // Unknown subscription (no prior sync mapping user → originalTransactionId).
      this.logger.warn(
        `Webhook for unknown subscription ${note.transaction.originalTransactionId}`,
      );
      return;
    }
    await this.applyTransaction(sub.userId, note.transaction, note.notificationType);
  }

  /** Entitlement is derived only from a verified, non-expired subscription row. */
  async entitlements(userId: string): Promise<Entitlements> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.active, SubscriptionStatus.in_grace] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { expiresAt: 'desc' },
    });
    if (!sub) return { dealyPlus: false };
    return {
      dealyPlus: true,
      productId: sub.productId,
      expiresAt: sub.expiresAt?.toISOString() ?? null,
      environment: sub.environment,
    };
  }

  private async applyTransaction(
    userId: string,
    tx: DecodedTransaction,
    eventType: string,
  ): Promise<void> {
    const status = this.statusFor(tx, eventType);
    const expiresAt = tx.expiresDateMs ? new Date(tx.expiresDateMs) : null;

    const sub = await this.prisma.subscription.upsert({
      where: { originalTransactionId: tx.originalTransactionId },
      update: { userId, productId: tx.productId, status, expiresAt, environment: tx.environment },
      create: {
        userId,
        productId: tx.productId,
        status,
        expiresAt,
        environment: tx.environment,
        originalTransactionId: tx.originalTransactionId,
      },
    });

    // Idempotent event record (replayed notifications are ignored).
    try {
      await this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          transactionId: tx.transactionId,
          type: eventType,
          payload: tx as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }

  private statusFor(tx: DecodedTransaction, eventType: string): SubscriptionStatus {
    if (tx.revocationDateMs || eventType === 'REFUND' || eventType === 'REVOKE') {
      return SubscriptionStatus.revoked;
    }
    if (eventType === 'GRACE_PERIOD' || eventType === 'DID_FAIL_TO_RENEW') {
      return SubscriptionStatus.in_grace;
    }
    if (tx.expiresDateMs && tx.expiresDateMs <= Date.now()) {
      return SubscriptionStatus.expired;
    }
    return SubscriptionStatus.active;
  }
}
