import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { GooglePlacesClient } from './google-places.client';
import type { PlaceResult } from './google-places.types';

@Injectable()
export class GooglePlacesService {
  private readonly client: GooglePlacesClient;

  constructor(config: ConfigService<Env, true>) {
    const apiKey =
      config.get('GOOGLE_PLACES_API_KEY', { infer: true }) ??
      config.get('GOOGLE_MAPS_SERVER_API_KEY', { infer: true });
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
}
