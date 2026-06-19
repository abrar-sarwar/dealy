import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { X509Certificate } from 'node:crypto';
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
  appAccountToken?: string;
}
interface RawNotification {
  notificationType: string;
  subtype?: string;
  data?: { signedTransactionInfo?: string };
}

/**
 * Verifies App Store Server JWS. SECURITY: the x5c leaf signature alone proves
 * only that *someone* signed the payload — so we ALSO validate the full
 * certificate chain terminates at Apple's root CA (configured via
 * `APPLE_ROOT_CA_BASE64`, the DER of "Apple Root CA - G3"). Without that root,
 * the verifier FAILS CLOSED and grants nothing — a forged self-signed cert can
 * never mint an entitlement.
 *
 * Tests inject a stub verifier; this implementation is exercised only with real
 * Apple transactions + the configured root.
 */
@Injectable()
export class AppleJwsVerifier implements AppStoreVerifier {
  private readonly appleRoot: X509Certificate | null;

  constructor(config: ConfigService<Env, true>) {
    const rootB64 = config.get('APPLE_ROOT_CA_BASE64', { infer: true });
    this.appleRoot = rootB64 ? new X509Certificate(Buffer.from(rootB64, 'base64')) : null;
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
    if (!this.appleRoot) {
      // Fail closed: never trust a transaction we can't anchor to Apple's root.
      throw new Error('App Store verification not configured (APPLE_ROOT_CA_BASE64 missing)');
    }

    const [headerB64] = jws.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg: string;
      x5c?: string[];
    };
    if (!header.x5c || header.x5c.length < 2) {
      throw new Error('App Store JWS is missing its certificate chain');
    }

    // 1) The chain must be valid and terminate at Apple's root.
    this.assertValidAppleChain(header.x5c);

    // 2) The JWS must be signed by the (now-trusted) leaf certificate.
    const key = await importX509(this.derToPem(header.x5c[0]), header.alg);
    const { payload } = await compactVerify(jws, key);
    return JSON.parse(new TextDecoder().decode(payload));
  }

  /** Validates x5c: each cert in date range, each signed by the next, chain ends at Apple root. */
  private assertValidAppleChain(x5c: string[]): void {
    const root = this.appleRoot;
    if (!root) throw new Error('App Store verification not configured');

    const certs = x5c.map((c) => new X509Certificate(Buffer.from(c, 'base64')));
    const now = Date.now();
    for (const cert of certs) {
      if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now) {
        throw new Error('Certificate outside its validity period');
      }
    }
    for (let i = 0; i < certs.length - 1; i++) {
      if (!certs[i].verify(certs[i + 1].publicKey)) {
        throw new Error('Broken certificate chain');
      }
    }
    const top = certs[certs.length - 1];
    const anchored = top.fingerprint256 === root.fingerprint256 || top.verify(root.publicKey);
    if (!anchored) {
      throw new Error('Certificate chain does not terminate at Apple Root CA');
    }
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
      appAccountToken: raw.appAccountToken,
    };
  }
}
