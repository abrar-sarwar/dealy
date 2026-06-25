import type { PlaceResult, ResolvedPhoto } from './google-places.types';

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
  /** When true, also request types/priceLevel/rating/website/phone (inventory
   *  discovery). Off by default so the merchant-resolver path stays cheap. */
  includeDetails?: boolean;
}

const BASE_FIELD_MASK = 'places.id,places.displayName,places.location,places.formattedAddress';
const DETAIL_FIELD_MASK =
  `${BASE_FIELD_MASK},places.types,places.priceLevel,places.rating,` +
  'places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,' +
  'places.photos.name,places.photos.authorAttributions';
/** Field mask for a single Place Details lookup that only needs photos. */
const PHOTO_DETAIL_FIELD_MASK = 'id,photos.name,photos.authorAttributions';

interface GooglePhoto {
  name?: string;
  authorAttributions?: { displayName?: string }[];
}

/** First usable photo reference + attribution from a Google photos[] array. */
function firstPhoto(photos: unknown): { reference: string | null; attribution: string | null } {
  const arr = Array.isArray(photos) ? (photos as GooglePhoto[]) : [];
  for (const ph of arr) {
    if (ph?.name) {
      return {
        reference: ph.name,
        attribution: ph.authorAttributions?.[0]?.displayName ?? null,
      };
    }
  }
  return { reference: null, attribution: null };
}

/** Heuristic: the resolved CDN URL points at a logo-type asset, not a real photo. */
function looksLikeLogo(url: string): boolean {
  return /logo|gps-proxy/i.test(url);
}

export interface PlaceDetails {
  photoReference: string | null;
  photoAttribution: string | null;
}

/** Map Google's PRICE_LEVEL_* enum (Places API v1) to a 0–4 integer. */
function priceLevelToInt(v: unknown): number | null {
  switch (v) {
    case 'PRICE_LEVEL_FREE':
      return 0;
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1;
    case 'PRICE_LEVEL_MODERATE':
      return 2;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4;
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
      return v;
    default:
      return null;
  }
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
          'X-Goog-FieldMask': p.includeDetails ? DETAIL_FIELD_MASK : BASE_FIELD_MASK,
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
      .map((place): PlaceResult | null => {
        const pl = place as Record<string, unknown>;
        const loc = pl.location as { latitude?: number; longitude?: number } | undefined;
        const displayName = pl.displayName as { text?: string } | undefined;
        if (!loc?.latitude || !loc?.longitude || !pl.id) return null;
        const photo = firstPhoto(pl.photos);
        return {
          name: displayName?.text ?? '',
          latitude: loc.latitude,
          longitude: loc.longitude,
          address: (pl.formattedAddress as string | undefined) ?? null,
          placeId: pl.id as string,
          types: (pl.types as string[] | undefined) ?? [],
          priceLevel: priceLevelToInt(pl.priceLevel),
          rating: (pl.rating as number | undefined) ?? null,
          userRatingsTotal: (pl.userRatingCount as number | undefined) ?? null,
          website: (pl.websiteUri as string | undefined) ?? null,
          phone: (pl.nationalPhoneNumber as string | undefined) ?? null,
          photoReference: photo.reference,
          photoAttribution: photo.attribution,
        };
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

  /**
   * A single Place Details lookup that fetches only the photo reference +
   * attribution for an existing place id. BILLABLE — callers must cap usage.
   */
  async placeDetails(placeId: string, timeoutMs?: number): Promise<PlaceDetails | null> {
    if (!this.apiKey) return null;

    let response: Response;
    try {
      response = await this.fetchFn(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        {
          method: 'GET',
          headers: {
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': PHOTO_DETAIL_FIELD_MASK,
          },
          signal: AbortSignal.timeout(timeoutMs ?? this.timeoutMs),
        },
      );
    } catch {
      return null;
    }

    if (!response.ok) return null;

    let json: { photos?: unknown };
    try {
      json = (await response.json()) as { photos?: unknown };
    } catch {
      return null;
    }

    const photo = firstPhoto(json.photos);
    return { photoReference: photo.reference, photoAttribution: photo.attribution };
  }

  /**
   * Resolve a Google photo resource name to a KEYLESS, client-loadable CDN URL.
   *
   * Calls the Places photo `media` endpoint server-side WITH the API key and
   * follows the 302 redirect to the keyless googleusercontent URL — so the iOS
   * client loads the image WITHOUT ever seeing the API key. BILLABLE per call.
   * Respects the configured per-call timeout; failures return null.
   */
  async resolvePhotoUrl(
    photoReference: string,
    maxWidthPx: number,
    timeoutMs?: number,
  ): Promise<ResolvedPhoto | null> {
    if (!this.apiKey) return null;

    const url =
      `https://places.googleapis.com/v1/${photoReference}/media` +
      `?maxWidthPx=${maxWidthPx}&key=${encodeURIComponent(this.apiKey)}`;

    let response: Response;
    try {
      // `redirect: 'follow'` (the default) lands on the keyless CDN URL, exposed
      // via response.url — the final URL after the 302.
      response = await this.fetchFn(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs ?? this.timeoutMs),
      });
    } catch {
      return null;
    }

    if (!response.ok) return null;
    const finalUrl = response.url;
    if (!finalUrl) return null;

    return { url: finalUrl, isLogo: looksLikeLogo(finalUrl) };
  }
}
