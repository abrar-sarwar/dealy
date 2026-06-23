// src/crawler/geocoding/geocoder.provider.ts
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { GEOCODER } from './geocoder';
import { NominatimGeocoder } from './nominatim-geocoder';
import { MapboxGeocoder } from './mapbox-geocoder';

export const geocoderProvider: Provider = {
  provide: GEOCODER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const key = config.get('GEOCODER_KEY', { infer: true });
    return key ? new MapboxGeocoder(key) : new NominatimGeocoder();
  },
};
