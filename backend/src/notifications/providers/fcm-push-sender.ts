import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import type { PushMessage, PushSender, PushSendResult } from '../push-sender';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

/**
 * Firebase Cloud Messaging adapter (HTTP v1). Gated behind
 * `FIREBASE_SERVICE_ACCOUNT_BASE64` + `FIREBASE_PROJECT_ID`.
 *
 * Status: IMPLEMENTED, AWAITING CREDENTIALS — not yet exercised against the live
 * FCM endpoint. With a service account it mints a short-lived OAuth token and
 * posts to `/v1/projects/{id}/messages:send`. Until then `isAvailable()` is
 * false and the system uses the local sender. APNs delivery is configured in
 * Firebase (upload the APNs auth key) — see docs/testflight.md.
 */
@Injectable()
export class FcmPushSender implements PushSender {
  readonly name = 'fcm';
  private readonly logger = new Logger(FcmPushSender.name);
  private readonly account: ServiceAccount | null;
  private readonly projectId?: string;

  constructor(config: ConfigService<Env, true>) {
    this.projectId = config.get('FIREBASE_PROJECT_ID', { infer: true });
    const b64 = config.get('FIREBASE_SERVICE_ACCOUNT_BASE64', { infer: true });
    this.account = b64 ? this.decodeAccount(b64) : null;
  }

  isAvailable(): boolean {
    return this.account !== null && Boolean(this.projectId);
  }

  async send(messages: PushMessage[]): Promise<PushSendResult[]> {
    if (!this.account || !this.projectId) {
      return messages.map((m) => ({ token: m.token, success: false }));
    }
    const accessToken = await this.mintAccessToken(this.account);
    const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;

    // FCM v1 sends one message per request; small batches are fine here.
    return Promise.all(
      messages.map(async (m): Promise<PushSendResult> => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${accessToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token: m.token,
                notification: { title: m.title, body: m.body },
                data: m.data ?? {},
              },
            }),
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) return { token: m.token, success: true };
          // 404/UNREGISTERED → token is dead.
          const invalidToken = res.status === 404 || res.status === 400;
          return { token: m.token, success: false, invalidToken };
        } catch (err) {
          this.logger.error(`FCM send failed: ${(err as Error).message}`);
          return { token: m.token, success: false };
        }
      }),
    );
  }

  private decodeAccount(b64: string): ServiceAccount | null {
    try {
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as ServiceAccount;
    } catch {
      this.logger.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64 JSON.');
      return null;
    }
  }

  /** Mints a Google OAuth access token from the service account (JWT bearer grant). */
  private async mintAccessToken(account: ServiceAccount): Promise<string> {
    // Imported lazily so the (heavier) jose import isn't on the hot path when FCM is disabled.
    const { SignJWT, importPKCS8 } = await import('jose');
    const now = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(account.private_key, 'RS256');
    const assertion = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(account.client_email)
      .setSubject(account.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) throw new Error(`OAuth token exchange failed: ${res.status}`);
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }
}
