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
}
