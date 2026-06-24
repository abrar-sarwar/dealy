import { createHash } from 'crypto';

export type DiscoveryTriggerReason =
  | 'crawler_disabled'
  | 'below_minimum_deals'
  | 'inventory_never_refreshed'
  | 'inventory_stale'
  | 'inventory_healthy';

export interface DiscoveryTriggerInput {
  enabled: boolean;
  dealCount: number;
  minLocalDeals: number;
  lastRefresh: Date | null;
  refreshHours: number;
  now?: Date;
}

export interface DiscoveryTriggerDecision {
  trigger: boolean;
  reason: DiscoveryTriggerReason;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function contentHash(content: string): string {
  return sha256(normalizeText(content));
}

export function aiCacheKey(input: {
  task: string;
  model: string;
  schemaVersion: string;
  prompt: string;
}): string {
  return sha256(
    JSON.stringify({
      task: input.task,
      model: input.model,
      schemaVersion: input.schemaVersion,
      prompt: normalizeText(input.prompt),
    }),
  );
}

export function shouldTriggerDiscovery(input: DiscoveryTriggerInput): DiscoveryTriggerDecision {
  if (!input.enabled) return { trigger: false, reason: 'crawler_disabled' };
  if (input.dealCount < input.minLocalDeals)
    return { trigger: true, reason: 'below_minimum_deals' };
  if (!input.lastRefresh) return { trigger: true, reason: 'inventory_never_refreshed' };

  const now = input.now ?? new Date();
  const ageMs = now.getTime() - input.lastRefresh.getTime();
  if (ageMs > input.refreshHours * 60 * 60 * 1000) {
    return { trigger: true, reason: 'inventory_stale' };
  }
  return { trigger: false, reason: 'inventory_healthy' };
}
