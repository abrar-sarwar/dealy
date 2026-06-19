export const APP_STORE_VERIFIER = Symbol('APP_STORE_VERIFIER');

export interface DecodedTransaction {
  productId: string;
  originalTransactionId: string;
  transactionId: string;
  expiresDateMs?: number;
  revocationDateMs?: number;
  environment: string;
  /** Apple's per-user binding (the app sets this to the user id at purchase). */
  appAccountToken?: string;
}

export interface DecodedNotification {
  notificationType: string;
  subtype?: string;
  transaction?: DecodedTransaction;
}

/**
 * Verifies + decodes App Store Server signed JWS payloads. The entitlement is
 * always derived from the VERIFIED transaction — never a client boolean.
 */
export interface AppStoreVerifier {
  verifyTransaction(signedTransactionInfo: string): Promise<DecodedTransaction>;
  verifyNotification(signedPayload: string): Promise<DecodedNotification>;
}
