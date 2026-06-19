import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { POSTHOG_CLIENT, type PosthogClient } from './posthog.provider';
import type { DealyEvent } from './events';

/** Keys never forwarded to analytics (privacy). */
const FORBIDDEN_KEYS = new Set([
  'token',
  'access_token',
  'authorization',
  'password',
  'email',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'coordinates',
]);

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  constructor(@Inject(POSTHOG_CLIENT) private readonly client: PosthogClient) {}

  /** Fire-and-forget capture. No-op when PostHog is unconfigured. */
  track(event: DealyEvent, distinctId: string, properties: Record<string, unknown> = {}): void {
    if (!this.client) return;
    this.client.capture({ distinctId, event, properties: this.sanitize(properties) });
  }

  /** Strips sensitive keys and over-long values so secrets/PII never leak. */
  private sanitize(properties: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) continue;
      if (typeof value === 'string' && value.length > 256) continue;
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        out[key] = value;
      }
    }
    return out;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.shutdown();
  }
}
