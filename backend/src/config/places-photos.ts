import type { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/** Resolved, typed config for the Google Places photo pipeline (API-SAFE caps). */
export interface PlacesPhotosConfig {
  /** Master switch — when false the job is a logged no-op. */
  enabled: boolean;
  /** A stored photo older than this is treated as stale and re-fetched. */
  refreshDays: number;
  /** Hard cap on Google lookups per single job run. */
  maxLookupsPerRun: number;
  /** Hard cap on total photos fetched for a region (across runs, within a run). */
  maxPhotosPerRegion: number;
  /** Per-call timeout (ms) for the Places photo `media` redirect resolution. */
  timeoutMs: number;
}

export function placesPhotosConfig(config: ConfigService<Env, true>): PlacesPhotosConfig {
  return {
    enabled: config.get('GOOGLE_PLACES_PHOTOS_ENABLED', { infer: true }),
    refreshDays: config.get('PLACES_PHOTO_REFRESH_DAYS', { infer: true }),
    maxLookupsPerRun: config.get('MAX_PLACE_PHOTO_LOOKUPS_PER_RUN', { infer: true }),
    maxPhotosPerRegion: config.get('MAX_PLACE_PHOTOS_PER_REGION', { infer: true }),
    timeoutMs: config.get('PLACE_PHOTO_TIMEOUT_MS', { infer: true }),
  };
}
