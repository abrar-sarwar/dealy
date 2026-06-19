import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import type { Env } from '../config/env.schema';

export const POSTHOG_CLIENT = Symbol('POSTHOG_CLIENT');
export type PosthogClient = PostHog | null;

/** PostHog client, or null when unconfigured (analytics then no-ops). */
export const posthogProvider = {
  provide: POSTHOG_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): PosthogClient => {
    const apiKey = config.get('POSTHOG_API_KEY', { infer: true });
    if (!apiKey) {
      new Logger('Analytics').warn('POSTHOG_API_KEY not set — analytics are a no-op.');
      return null;
    }
    return new PostHog(apiKey, { host: config.get('POSTHOG_HOST', { infer: true }) });
  },
};
