import type { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

export interface DiscoveryConfig {
  minLocalDeals: number;
  localDealRefreshHours: number;
  maxDiscoveryRunsPerDay: number;
  crawlerEnabled: boolean;
  aiEnabled: boolean;
}

export function discoveryConfig(config: ConfigService<Env, true>): DiscoveryConfig {
  return {
    minLocalDeals: config.get('MIN_LOCAL_DEALS', { infer: true }),
    localDealRefreshHours: config.get('LOCAL_DEAL_REFRESH_HOURS', { infer: true }),
    maxDiscoveryRunsPerDay: config.get('MAX_DISCOVERY_RUNS_PER_DAY', { infer: true }),
    crawlerEnabled: config.get('CRAWLER_ENABLED', { infer: true }),
    aiEnabled: config.get('AI_ENABLED', { infer: true }),
  };
}
