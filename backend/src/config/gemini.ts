import type { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

export interface GeminiConfig {
  apiKey?: string;
  model: string;
  reasoningModel: string;
  cacheTtlHours: number;
  enabled: boolean;
  escalationMaxConfidence: number;
  escalationMinReliability: number;
}

export function geminiConfig(config: ConfigService<Env, true>): GeminiConfig {
  return {
    apiKey: config.get('GOOGLE_GEMINI_API_KEY', { infer: true }),
    model: config.get('GEMINI_MODEL', { infer: true }),
    reasoningModel: config.get('GEMINI_REASONING_MODEL', { infer: true }),
    cacheTtlHours: config.get('AI_CACHE_TTL_HOURS', { infer: true }),
    enabled: config.get('AI_ENABLED', { infer: true }),
    escalationMaxConfidence: config.get('GEMINI_ESCALATION_MAX_CONFIDENCE', { infer: true }),
    escalationMinReliability: config.get('GEMINI_ESCALATION_MIN_RELIABILITY', { infer: true }),
  };
}
