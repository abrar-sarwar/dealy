import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MeiliSearch } from 'meilisearch';
import type { Env } from '../config/env.schema';
import { MEILI_CLIENT } from './search.constants';

export type MeiliClient = MeiliSearch | null;

/** Builds the Meilisearch client, or null when unconfigured (search then falls back to Postgres). */
export const meiliClientProvider = {
  provide: MEILI_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): MeiliClient => {
    const host = config.get('MEILISEARCH_HOST', { infer: true });
    const apiKey = config.get('MEILISEARCH_MASTER_KEY', { infer: true });
    if (!host) {
      new Logger('Meili').warn('MEILISEARCH_HOST not set — search uses the Postgres fallback.');
      return null;
    }
    return new MeiliSearch({ host, apiKey });
  },
};
