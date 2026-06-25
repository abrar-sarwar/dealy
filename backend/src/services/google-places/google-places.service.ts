import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { GooglePlacesClient, type PlaceDetails } from './google-places.client';
import type { PlaceResult, ResolvedPhoto } from './google-places.types';

@Injectable()
export class GooglePlacesService {
  private readonly client: GooglePlacesClient;
  readonly apiKeyPresent: boolean;

  constructor(config: ConfigService<Env, true>) {
    const apiKey =
      config.get('GOOGLE_PLACES_API_KEY', { infer: true }) ??
      config.get('GOOGLE_MAPS_SERVER_API_KEY', { infer: true });
    this.apiKeyPresent = Boolean(apiKey);
    this.client = new GooglePlacesClient({ apiKey });
  }

  async nearbySearch(p: {
    query: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    includeDetails?: boolean;
  }): Promise<PlaceResult[]> {
    return this.client.nearbySearch(p);
  }

  /** Fetch only the photo reference + attribution for an existing place id. */
  async placeDetails(placeId: string, timeoutMs?: number): Promise<PlaceDetails | null> {
    return this.client.placeDetails(placeId, timeoutMs);
  }

  /** Resolve a photo reference to a keyless, client-loadable CDN URL. */
  async resolvePhotoUrl(
    photoReference: string,
    maxWidthPx: number,
    timeoutMs?: number,
  ): Promise<ResolvedPhoto | null> {
    return this.client.resolvePhotoUrl(photoReference, maxWidthPx, timeoutMs);
  }
}
