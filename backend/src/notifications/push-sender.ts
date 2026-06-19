export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  token: string;
  success: boolean;
  /** True when the provider reports the token is permanently invalid → clean up. */
  invalidToken?: boolean;
}

/**
 * Server push delivery abstraction. FCM is the production adapter (it fans out
 * to APNs for iOS); a local adapter records "delivery" for dev/tests so the
 * notification pipeline is verifiable without credentials.
 */
export interface PushSender {
  readonly name: string;
  isAvailable(): boolean;
  send(messages: PushMessage[]): Promise<PushSendResult[]>;
}
