export interface PlaceResult {
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  placeId: string;
  /** Google place types (e.g. ["restaurant", "food"]). Empty when not requested. */
  types?: string[];
  /** Google price level 0–4, when available. */
  priceLevel?: number | null;
  /** Average rating 0–5, when available. */
  rating?: number | null;
  /** Total number of user ratings, when available. */
  userRatingsTotal?: number | null;
  /** Public website URL, when available. */
  website?: string | null;
  /** National-format phone number, when available. */
  phone?: string | null;
  /** First usable Google photo resource name (e.g. "places/X/photos/Y"), if any. */
  photoReference?: string | null;
  /** Author/source attribution text for the primary photo, if any. */
  photoAttribution?: string | null;
}

/** Result of resolving a Google photo reference to a keyless, client-loadable URL. */
export interface ResolvedPhoto {
  /**
   * The final keyless CDN URL (e.g. https://lh3.googleusercontent.com/…) the photo
   * `media` endpoint 302-redirects to. The API key is never part of this URL, so
   * the iOS client can load it directly without ever seeing the key.
   */
  url: string;
  /** Whether the asset is a usable place/food/interior photo vs. a logo-type asset. */
  isLogo: boolean;
}
