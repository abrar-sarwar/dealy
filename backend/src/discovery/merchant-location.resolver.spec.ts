import { MerchantLocationResolver } from './merchant-location.resolver';
import type { PlaceResult } from '../services/google-places/google-places.types';

const CENTROID = { latitude: 33.749, longitude: -84.388 };
const PLACE_RESULT: PlaceResult = {
  name: 'Chipotle Midtown',
  latitude: 33.771,
  longitude: -84.388,
  address: '100 Peachtree St, Atlanta, GA',
  placeId: 'place-x',
};

function makeDeps(overrides: {
  geocoderResult?: { latitude: number; longitude: number; confidence: number } | null;
  placesResults?: PlaceResult[];
}) {
  const geocoder = {
    geocode: jest.fn().mockResolvedValue(overrides.geocoderResult ?? null),
  };

  const places = {
    nearbySearch: jest.fn().mockResolvedValue(overrides.placesResults ?? [PLACE_RESULT]),
  };

  // Simple passthrough cache that delegates to generate()
  const aiCache = {
    getOrGenerate: jest.fn(
      async (
        _params: unknown,
        generate: () => Promise<unknown>,
      ): Promise<{ value: unknown; cacheHit: boolean }> => ({
        value: await generate(),
        cacheHit: false,
      }),
    ),
  };

  return { geocoder, places, aiCache };
}

function build(d: ReturnType<typeof makeDeps>): MerchantLocationResolver {
  return new MerchantLocationResolver(d.places as never, d.geocoder as never, d.aiCache as never);
}

describe('MerchantLocationResolver.resolve', () => {
  it('returns exact coords via geocoder when locationText looks like a street address', async () => {
    const d = makeDeps({
      geocoderResult: { latitude: 33.8, longitude: -84.4, confidence: 0.9 },
    });
    const resolver = build(d);
    const result = await resolver.resolve({
      merchant: 'Chipotle',
      locationText: '100 Peachtree St, Atlanta, GA',
      centroid: CENTROID,
      radiusMiles: 10,
    });

    expect(d.geocoder.geocode).toHaveBeenCalledWith('100 Peachtree St, Atlanta, GA');
    expect(result.locationPrecision).toBe('exact');
    expect(result.latitude).toBe(33.8);
    expect(result.longitude).toBe(-84.4);
    expect(result.locationText).toBe('100 Peachtree St, Atlanta, GA');
    // Places should NOT be called when geocoder resolves
    expect(d.places.nearbySearch).not.toHaveBeenCalled();
  });

  it('falls through to Places when geocoder returns null for an address', async () => {
    const d = makeDeps({ geocoderResult: null, placesResults: [PLACE_RESULT] });
    const resolver = build(d);
    const result = await resolver.resolve({
      merchant: 'Chipotle',
      locationText: '100 Peachtree St, Atlanta, GA',
      centroid: CENTROID,
      radiusMiles: 10,
    });

    expect(result.locationPrecision).toBe('exact');
    expect(result.latitude).toBe(PLACE_RESULT.latitude);
    expect(result.longitude).toBe(PLACE_RESULT.longitude);
  });

  it('returns exact coords via Places when merchant and centroid are present (chain path)', async () => {
    const d = makeDeps({ placesResults: [PLACE_RESULT] });
    const resolver = build(d);
    const result = await resolver.resolve({
      merchant: 'Chipotle',
      locationText: null,
      centroid: CENTROID,
      radiusMiles: 10,
    });

    expect(d.places.nearbySearch).toHaveBeenCalledTimes(1);
    expect(d.places.nearbySearch).toHaveBeenCalledWith({
      query: 'Chipotle',
      latitude: CENTROID.latitude,
      longitude: CENTROID.longitude,
      radiusMeters: 10 * 1609.34,
    });
    expect(result.locationPrecision).toBe('exact');
    expect(result.latitude).toBe(PLACE_RESULT.latitude);
    expect(result.longitude).toBe(PLACE_RESULT.longitude);
    expect(result.locationText).toBe(PLACE_RESULT.address);
  });

  it('memoizes via aiCache: second resolve with same merchant+centroid calls nearbySearch at most once', async () => {
    const d = makeDeps({ placesResults: [PLACE_RESULT] });
    // Simulate caching: first call runs generate(), second call returns cached value
    let cachedValue: PlaceResult[] | undefined;
    d.aiCache.getOrGenerate = jest.fn(
      async (
        _params: unknown,
        generate: () => Promise<unknown>,
      ): Promise<{ value: unknown; cacheHit: boolean }> => {
        if (cachedValue !== undefined) {
          return { value: cachedValue, cacheHit: true };
        }
        cachedValue = (await generate()) as PlaceResult[];
        return { value: cachedValue, cacheHit: false };
      },
    );

    const resolver = build(d);
    await resolver.resolve({
      merchant: 'Chipotle',
      locationText: null,
      centroid: CENTROID,
      radiusMiles: 10,
    });
    await resolver.resolve({
      merchant: 'Chipotle',
      locationText: null,
      centroid: CENTROID,
      radiusMiles: 10,
    });

    // nearbySearch should have been called only once (second resolve hits cache)
    expect(d.places.nearbySearch).toHaveBeenCalledTimes(1);
  });

  it('returns approximate centroid when no merchant is provided', async () => {
    const d = makeDeps({});
    const resolver = build(d);
    const result = await resolver.resolve({
      merchant: null,
      locationText: null,
      centroid: CENTROID,
      radiusMiles: 10,
    });

    expect(result.locationPrecision).toBe('approximate');
    expect(result.latitude).toBe(CENTROID.latitude);
    expect(result.longitude).toBe(CENTROID.longitude);
    expect(d.places.nearbySearch).not.toHaveBeenCalled();
  });

  it('returns approximate centroid when no centroid is provided', async () => {
    const d = makeDeps({});
    const resolver = build(d);
    const result = await resolver.resolve({
      merchant: 'Chipotle',
      locationText: null,
      centroid: null,
      radiusMiles: 10,
    });

    expect(result.locationPrecision).toBe('approximate');
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(d.places.nearbySearch).not.toHaveBeenCalled();
  });

  it('returns approximate centroid when Places returns empty array', async () => {
    const d = makeDeps({ placesResults: [] });
    const resolver = build(d);
    const result = await resolver.resolve({
      merchant: 'Chipotle',
      locationText: null,
      centroid: CENTROID,
      radiusMiles: 10,
    });

    expect(result.locationPrecision).toBe('approximate');
    expect(result.latitude).toBe(CENTROID.latitude);
    expect(result.longitude).toBe(CENTROID.longitude);
  });

  it('does not treat a short locationText as an address', async () => {
    const d = makeDeps({ placesResults: [PLACE_RESULT] });
    const resolver = build(d);
    const result = await resolver.resolve({
      merchant: 'Chipotle',
      locationText: '1 St', // length <= 6
      centroid: CENTROID,
      radiusMiles: 10,
    });

    expect(d.geocoder.geocode).not.toHaveBeenCalled();
    expect(result.locationPrecision).toBe('exact'); // resolved via places
  });
});
