import { GooglePlacesClient } from './google-places.client';

function makeFetchWithPlaces(
  places: {
    id: string;
    displayName: { text: string };
    location: { latitude: number; longitude: number };
    formattedAddress: string;
  }[],
): typeof fetch {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ places }),
  }) as unknown as typeof fetch;
}

describe('GooglePlacesClient.nearbySearch', () => {
  const origin = { latitude: 33.749, longitude: -84.388, radiusMeters: 10_000 };

  it('returns empty array when no apiKey is provided', async () => {
    const client = new GooglePlacesClient({ fetchFn: makeFetchWithPlaces([]) });
    const results = await client.nearbySearch({ query: 'Chipotle', ...origin });
    expect(results).toEqual([]);
  });

  it('returns empty array when the API response is not ok', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const client = new GooglePlacesClient({ apiKey: 'key', fetchFn: fakeFetch });
    const results = await client.nearbySearch({ query: 'Chipotle', ...origin });
    expect(results).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    const fakeFetch = jest
      .fn()
      .mockRejectedValue(new Error('network error')) as unknown as typeof fetch;
    const client = new GooglePlacesClient({ apiKey: 'key', fetchFn: fakeFetch });
    const results = await client.nearbySearch({ query: 'Chipotle', ...origin });
    expect(results).toEqual([]);
  });

  it('returns two places sorted nearest-first', async () => {
    // Place A is farther, Place B is nearer to origin (33.749, -84.388)
    const placeA = {
      id: 'place-a',
      displayName: { text: 'Chipotle Buckhead' },
      location: { latitude: 33.838, longitude: -84.374 }, // ~10km north
      formattedAddress: '1 Buckhead Ave, Atlanta, GA',
    };
    const placeB = {
      id: 'place-b',
      displayName: { text: 'Chipotle Midtown' },
      location: { latitude: 33.771, longitude: -84.388 }, // ~2.4km north
      formattedAddress: '100 Peachtree St, Atlanta, GA',
    };

    // API returns A first, but B should be sorted to front after distance sort
    const fakeFetch = makeFetchWithPlaces([placeA, placeB]);
    const client = new GooglePlacesClient({ apiKey: 'key', fetchFn: fakeFetch });
    const results = await client.nearbySearch({ query: 'Chipotle', ...origin });

    expect(results).toHaveLength(2);
    expect(results[0].placeId).toBe('place-b'); // nearer
    expect(results[1].placeId).toBe('place-a'); // farther
  });

  it('maps API response fields to PlaceResult shape', async () => {
    const place = {
      id: 'place-x',
      displayName: { text: 'Test Store' },
      location: { latitude: 33.75, longitude: -84.39 },
      formattedAddress: '123 Main St, Atlanta, GA',
    };
    const fakeFetch = makeFetchWithPlaces([place]);
    const client = new GooglePlacesClient({ apiKey: 'key', fetchFn: fakeFetch });
    const results = await client.nearbySearch({ query: 'Test Store', ...origin });

    expect(results[0]).toEqual({
      name: 'Test Store',
      latitude: 33.75,
      longitude: -84.39,
      address: '123 Main St, Atlanta, GA',
      placeId: 'place-x',
    });
  });

  it('caps radius at 50,000 metres in the request body', async () => {
    const fakeFetch = makeFetchWithPlaces([]) as jest.Mock;
    const client = new GooglePlacesClient({
      apiKey: 'key',
      fetchFn: fakeFetch as unknown as typeof fetch,
    });
    await client.nearbySearch({ query: 'Store', ...origin, radiusMeters: 100_000 });

    const callArgs = fakeFetch.mock.calls[0] as unknown[];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string) as {
      locationBias: { circle: { radius: number } };
    };
    expect(body.locationBias.circle.radius).toBe(50_000);
  });
});
