import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compactVerify, importX509 } from 'jose';
import type { Env } from '../config/env.schema';
import type {
  AppStoreVerifier,
  DecodedNotification,
  DecodedTransaction,
} from './app-store-verifier';

interface RawTransaction {
  productId: string;
  originalTransactionId: string;
  transactionId: string;
  expiresDate?: number;
  revocationDate?: number;
  environment?: string;
}
interface RawNotification {
  notificationType: string;
  subtype?: string;
  data?: { signedTransactionInfo?: string };
}

/**
 * Verifies App Store Server JWS (x5c-signed). In production the signature is
 * checked against the leaf certificate in the JWS header.
 *
 * NOTE / AWAITING CREDENTIALS: full chain pinning to Apple's root CA is the
 * remaining production hardening (the leaf signature IS verified here). Not yet
 * exercised against real App Store transactions — tests inject a stub verifier.
 */
@Injectable()
export class AppleJwsVerifier implements AppStoreVerifier {
  private readonly logger = new Logger(AppleJwsVerifier.name);
  private readonly isProd: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.isProd = config.get('APPLE_APPSTORE_ENV', { infer: true }) === 'production';
  }

  async verifyTransaction(signedTransactionInfo: string): Promise<DecodedTransaction> {
    const raw = (await this.verifyJws(signedTransactionInfo)) as RawTransaction;
    return this.toTransaction(raw);
  }

  async verifyNotification(signedPayload: string): Promise<DecodedNotification> {
    const raw = (await this.verifyJws(signedPayload)) as RawNotification;
    let transaction: DecodedTransaction | undefined;
    if (raw.data?.signedTransactionInfo) {
      transaction = await this.verifyTransaction(raw.data.signedTransactionInfo);
    }
    return { notificationType: raw.notificationType, subtype: raw.subtype, transaction };
  }

  private async verifyJws(jws: string): Promise<unknown> {
    const [headerB64] = jws.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg: string;
      x5c?: string[];
    };

    if (header.x5c && header.x5c.length > 0) {
      const leafPem = this.derToPem(header.x5c[0]);
      const key = await importX509(leafPem, header.alg);
      const { payload } = await compactVerify(jws, key); // throws on bad signature
      return JSON.parse(new TextDecoder().decode(payload));
    }

    if (this.isProd) {
      throw new Error('Rejected unsigned App Store payload in production');
    }
    this.logger.warn(
      'App Store payload has no x5c chain — decoding without verification (non-prod).',
    );
    return JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8'));
  }

  private derToPem(derBase64: string): string {
    const lines = derBase64.match(/.{1,64}/g)?.join('\n') ?? derBase64;
    return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
  }

  private toTransaction(raw: RawTransaction): DecodedTransaction {
    return {
      productId: raw.productId,
      originalTransactionId: raw.originalTransactionId,
      transactionId: raw.transactionId,
      expiresDateMs: raw.expiresDate,
      revocationDateMs: raw.revocationDate,
      environment: raw.environment ?? 'sandbox',
    };
  }
}
