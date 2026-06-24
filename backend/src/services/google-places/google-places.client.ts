import type { PlaceResult } from './google-places.types';

export interface GooglePlacesClientOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

interface NearbySearchParams {
  query: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

/** Haversine distance in metres between two lat/lng points. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export class GooglePlacesClient {
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: GooglePlacesClientOptions = {}) {
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  async nearbySearch(p: NearbySearchParams): Promise<PlaceResult[]> {
    if (!this.apiKey) return [];

    const body = {
      textQuery: p.query,
      locationBias: {
        circle: {
          center: { latitude: p.latitude, longitude: p.longitude },
          radius: Math.min(p.radiusMeters, 50_000),
        },
      },
    };

    let response: Response;
    try {
      response = await this.fetchFn('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.location,places.formattedAddress',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return [];
    }

    if (!response.ok) return [];

    let json: { places?: unknown[] };
    try {
      json = (await response.json()) as { places?: unknown[] };
    } catch {
      return [];
    }

    const places = json.places ?? [];

    const results: PlaceResult[] = places
      .map((place) => {
        const pl = place as Record<string, unknown>;
        const loc = pl.location as { latitude?: number; longitude?: number } | undefined;
        const displayName = pl.displayName as { text?: string } | undefined;
        if (!loc?.latitude || !loc?.longitude || !pl.id) return null;
        return {
          name: displayName?.text ?? '',
          latitude: loc.latitude,
          longitude: loc.longitude,
          address: (pl.formattedAddress as string | undefined) ?? null,
          placeId: pl.id as string,
        } satisfies PlaceResult;
      })
      .filter((r): r is PlaceResult => r !== null);

    // Sort ascending by haversine distance from the search origin
    results.sort(
      (a, b) =>
        haversineMeters(p.latitude, p.longitude, a.latitude, a.longitude) -
        haversineMeters(p.latitude, p.longitude, b.latitude, b.longitude),
    );

    return results;
  }
}
