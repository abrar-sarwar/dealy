import { Inject, Injectable } from '@nestjs/common';
import { GEOCODER, type Geocoder } from '../crawler/geocoding/geocoder';
import type { AiCacheService } from './ai-cache.service';
import type { GooglePlacesService } from '../services/google-places/google-places.service';
import type { PlaceResult } from '../services/google-places/google-places.types';

/** A street-address-like string: starts with a number, then a non-whitespace token, length > 6. */
const STREET_ADDRESS_RE = /\d+\s+\S+/;

export interface ResolvedLocation {
  latitude: number | null;
  longitude: number | null;
  locationPrecision: 'exact' | 'approximate';
  locationText: string | null;
}

@Injectable()
export class MerchantLocationResolver {
  constructor(
    private readonly places: GooglePlacesService,
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
    private readonly aiCache: AiCacheService,
  ) {}

  async resolve(p: {
    merchant: string | null;
    locationText: string | null;
    centroid: { latitude: number; longitude: number } | null;
    radiusMiles: number;
  }): Promise<ResolvedLocation> {
    // 1. Specific street address → geocode directly
    if (p.locationText && STREET_ADDRESS_RE.test(p.locationText) && p.locationText.length > 6) {
      const result = await this.geocoder.geocode(p.locationText);
      if (result) {
        return {
          latitude: result.latitude,
          longitude: result.longitude,
          locationPrecision: 'exact',
          locationText: p.locationText,
        };
      }
    }

    // 2. Named merchant + centroid → Places API (cached)
    if (p.merchant && p.centroid) {
      const { value: places } = await this.aiCache.getOrGenerate<PlaceResult[]>(
        {
          task: 'place_resolution',
          model: 'google-places',
          schemaVersion: 'v1',
          prompt: `${p.merchant}:${p.centroid.latitude.toFixed(2)},${p.centroid.longitude.toFixed(2)}`,
        },
        () =>
          this.places.nearbySearch({
            query: p.merchant!,
            latitude: p.centroid!.latitude,
            longitude: p.centroid!.longitude,
            radiusMeters: p.radiusMiles * 1609.34,
          }),
      );

      if (places[0]) {
        return {
          latitude: places[0].latitude,
          longitude: places[0].longitude,
          locationPrecision: 'exact',
          locationText: places[0].address ?? p.locationText,
        };
      }
    }

    // 3. Fallback → centroid (approximate)
    return {
      latitude: p.centroid?.latitude ?? null,
      longitude: p.centroid?.longitude ?? null,
      locationPrecision: 'approximate',
      locationText: p.locationText,
    };
  }
}
