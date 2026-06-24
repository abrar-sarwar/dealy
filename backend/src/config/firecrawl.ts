import type { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

export interface FirecrawlConfig {
  apiKey?: string;
  apiUrl: string;
  maxPagesPerRun: number;
  maxConcurrency: number;
  timeoutMs: number;
  enabled: boolean;
  maxPagesPerDay: number;
  maxPagesPerSourcePerDay: number;
  maxRecrawlsPerDay: number;
}

export function firecrawlConfig(config: ConfigService<Env, true>): FirecrawlConfig {
  return {
    apiKey: config.get('FIRECRAWL_API_KEY', { infer: true }),
    apiUrl: config.get('FIRECRAWL_API_URL', { infer: true }),
    maxPagesPerRun: config.get('FIRECRAWL_MAX_PAGES_PER_RUN', { infer: true }),
    maxConcurrency: config.get('FIRECRAWL_MAX_CONCURRENCY', { infer: true }),
    timeoutMs: config.get('FIRECRAWL_TIMEOUT_MS', { infer: true }),
    enabled: config.get('CRAWLER_ENABLED', { infer: true }),
    maxPagesPerDay: config.get('FIRECRAWL_MAX_PAGES_PER_DAY', { infer: true }),
    maxPagesPerSourcePerDay: config.get('FIRECRAWL_MAX_PAGES_PER_SOURCE_PER_DAY', { infer: true }),
    maxRecrawlsPerDay: config.get('FIRECRAWL_MAX_RECRAWLS_PER_DAY', { infer: true }),
  };
}
