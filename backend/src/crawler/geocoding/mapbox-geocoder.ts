// src/crawler/geocoding/mapbox-geocoder.ts
import type { Geocoder, GeocodeResult } from './geocoder';

/** Optional higher-accuracy geocoder, enabled when GEOCODER_KEY is set. */
export class MapboxGeocoder implements Geocoder {
  constructor(private readonly apiKey: string, private readonly fetchFn: typeof fetch = fetch) {}

  async geocode(address: string): Promise<GeocodeResult | null> {
    if (!address.trim()) return null;
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`,
    );
    url.searchParams.set('access_token', this.apiKey);
    url.searchParams.set('limit', '1');
    try {
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { features?: Array<{ center: [number, number]; relevance?: number }> };
      const f = data.features?.[0];
      if (!f) return null;
      return { latitude: f.center[1], longitude: f.center[0], confidence: f.relevance ?? 0.5 };
    } catch {
      return null;
    }
  }
}
