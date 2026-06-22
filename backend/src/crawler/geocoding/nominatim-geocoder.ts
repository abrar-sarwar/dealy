// src/crawler/geocoding/nominatim-geocoder.ts
import type { Geocoder, GeocodeResult } from './geocoder';

/** Free OpenStreetMap geocoder. Polite UA + single-result. Never throws. */
export class NominatimGeocoder implements Geocoder {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async geocode(address: string): Promise<GeocodeResult | null> {
    if (!address.trim()) return null;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    try {
      const res = await this.fetchFn(url, {
        headers: { 'User-Agent': 'DealyCrawler/1.0 (+https://dealy.app)' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<{ lat: string; lon: string; importance?: number }>;
      const top = rows[0];
      if (!top) return null;
      return {
        latitude: Number(top.lat),
        longitude: Number(top.lon),
        confidence: typeof top.importance === 'number' ? top.importance : 0.5,
      };
    } catch {
      return null;
    }
  }
}
