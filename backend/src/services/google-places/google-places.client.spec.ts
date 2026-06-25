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
      // Detail fields (added for place discovery) default to null/[] when the API
      // response omits them.
      types: [],
      priceLevel: null,
      rating: null,
      userRatingsTotal: null,
      website: null,
      phone: null,
      photoReference: null,
      photoAttribution: null,
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

  it('requests photos in the detail field mask and captures the first photo reference', async () => {
    const place = {
      id: 'place-photo',
      displayName: { text: 'Photo Cafe' },
      location: { latitude: 33.75, longitude: -84.39 },
      formattedAddress: '1 Photo St, Atlanta, GA',
      photos: [
        {
          name: 'places/place-photo/photos/ABC123',
          authorAttributions: [{ displayName: 'Jane Doe' }],
        },
        { name: 'places/place-photo/photos/SECOND' },
      ],
    };
    const fakeFetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ places: [place] }) });
    const client = new GooglePlacesClient({
      apiKey: 'key',
      fetchFn: fakeFetch as unknown as typeof fetch,
    });
    const results = await client.nearbySearch({
      query: 'Photo Cafe',
      ...origin,
      includeDetails: true,
    });

    const headers = (fakeFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Goog-FieldMask']).toContain('places.photos');
    expect(results[0].photoReference).toBe('places/place-photo/photos/ABC123');
    expect(results[0].photoAttribution).toBe('Jane Doe');
  });
});

describe('GooglePlacesClient.placeDetails', () => {
  it('returns null when no apiKey is provided', async () => {
    const client = new GooglePlacesClient({});
    expect(await client.placeDetails('place-x')).toBeNull();
  });

  it('fetches the photo reference for a place id', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'place-x',
        photos: [
          {
            name: 'places/place-x/photos/REF',
            authorAttributions: [{ displayName: 'Acme Photographer' }],
          },
        ],
      }),
    });
    const client = new GooglePlacesClient({
      apiKey: 'key',
      fetchFn: fakeFetch as unknown as typeof fetch,
    });
    const details = await client.placeDetails('place-x');
    expect(details?.photoReference).toBe('places/place-x/photos/REF');
    expect(details?.photoAttribution).toBe('Acme Photographer');
    // Hits the v1 place-details endpoint with the photos field mask.
    const url = fakeFetch.mock.calls[0][0] as string;
    expect(url).toContain('places/place-x');
  });

  it('returns null photoReference when the place has no photos', async () => {
    const fakeFetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'place-x' }) });
    const client = new GooglePlacesClient({
      apiKey: 'key',
      fetchFn: fakeFetch as unknown as typeof fetch,
    });
    const details = await client.placeDetails('place-x');
    expect(details?.photoReference).toBeNull();
  });

  it('returns null on a failed response', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({ ok: false });
    const client = new GooglePlacesClient({
      apiKey: 'key',
      fetchFn: fakeFetch as unknown as typeof fetch,
    });
    expect(await client.placeDetails('place-x')).toBeNull();
  });
});

describe('GooglePlacesClient.resolvePhotoUrl', () => {
  it('returns the redirected keyless googleusercontent URL (no API key in it)', async () => {
    const keylessUrl = 'https://lh3.googleusercontent.com/places/ABC=s1600?authuser=0&unverified';
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: keylessUrl,
      headers: { get: () => 'image/jpeg' },
    });
    const client = new GooglePlacesClient({
      apiKey: 'secret-key',
      fetchFn: fakeFetch as unknown as typeof fetch,
    });
    const resolved = await client.resolvePhotoUrl('places/X/photos/Y', 800);
    expect(resolved?.url).toBe(keylessUrl);
    expect(resolved?.url).not.toContain('secret-key');
    expect(resolved?.isLogo).toBe(false);
    // The media endpoint is called server-side WITH the key + maxWidthPx.
    const url = fakeFetch.mock.calls[0][0] as string;
    expect(url).toContain('places/X/photos/Y/media');
    expect(url).toContain('maxWidthPx=800');
    expect(url).toContain('key=secret-key');
  });

  it('flags a logo-type asset as isLogo', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: 'https://lh3.googleusercontent.com/gps-proxy/logo_LOGO=s200',
      headers: { get: () => 'image/png' },
    });
    const client = new GooglePlacesClient({
      apiKey: 'key',
      fetchFn: fakeFetch as unknown as typeof fetch,
    });
    const resolved = await client.resolvePhotoUrl('places/X/photos/LOGO', 400);
    expect(resolved?.isLogo).toBe(true);
  });

  it('returns null when there is no apiKey', async () => {
    const client = new GooglePlacesClient({});
    expect(await client.resolvePhotoUrl('places/X/photos/Y', 400)).toBeNull();
  });

  it('returns null on fetch failure / timeout', async () => {
    const fakeFetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const client = new GooglePlacesClient({
      apiKey: 'key',
      fetchFn: fakeFetch as unknown as typeof fetch,
    });
    expect(await client.resolvePhotoUrl('places/X/photos/Y', 400)).toBeNull();
  });

  it('returns null when the media response is not ok', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({ ok: false, status: 403, url: '' });
    const client = new GooglePlacesClient({
      apiKey: 'key',
      fetchFn: fakeFetch as unknown as typeof fetch,
    });
    expect(await client.resolvePhotoUrl('places/X/photos/Y', 400)).toBeNull();
  });
});
