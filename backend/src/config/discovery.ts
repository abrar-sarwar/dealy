import type { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

export interface DiscoveryConfig {
  minLocalDeals: number;
  localDealRefreshHours: number;
  crawlerEnabled: boolean;
  aiEnabled: boolean;
  cron: string;
  targetPaths: string[];
  publishMinConfidence: number;
  publishMinQuality: number;
}

export function discoveryConfig(config: ConfigService<Env, true>): DiscoveryConfig {
  return {
    minLocalDeals: config.get('MIN_LOCAL_DEALS', { infer: true }),
    localDealRefreshHours: config.get('LOCAL_DEAL_REFRESH_HOURS', { infer: true }),
    crawlerEnabled: config.get('CRAWLER_ENABLED', { infer: true }),
    aiEnabled: config.get('AI_ENABLED', { infer: true }),
    cron: config.get('DISCOVERY_CRON', { infer: true }),
    targetPaths: config
      .get('DISCOVERY_TARGET_PATHS', { infer: true })
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    publishMinConfidence: config.get('DISCOVERY_PUBLISH_MIN_CONFIDENCE', { infer: true }),
    publishMinQuality: config.get('DISCOVERY_PUBLISH_MIN_QUALITY', { infer: true }),
  };
}
