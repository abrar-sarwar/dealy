// src/crawler/geocoding/nominatim-geocoder.spec.ts
import { NominatimGeocoder } from './nominatim-geocoder';

describe('NominatimGeocoder', () => {
  it('maps the first result to lat/lng + confidence', async () => {
    const fetchFn = (async () => ({
      ok: true,
      json: async () => [{ lat: '33.7531', lon: '-84.3857', importance: 0.8 }],
    })) as unknown as typeof fetch;
    const geo = new NominatimGeocoder(fetchFn);
    const r = await geo.geocode('1 Peachtree St, Atlanta, GA');
    expect(r).toEqual({ latitude: 33.7531, longitude: -84.3857, confidence: 0.8 });
  });
  it('returns null when there is no match', async () => {
    const fetchFn = (async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;
    expect(await new NominatimGeocoder(fetchFn).geocode('nowhere')).toBeNull();
  });
  it('returns null (never throws) on a transport error', async () => {
    const fetchFn = (async () => {
      throw new Error('net');
    }) as unknown as typeof fetch;
    expect(await new NominatimGeocoder(fetchFn).geocode('x')).toBeNull();
  });
});
