import { Injectable, Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { GooglePlacesService } from '../services/google-places/google-places.service';
import type { PlaceResult } from '../services/google-places/google-places.types';

const MILES_TO_METERS = 1609.34;

/** Small, cheap default category set. Each category = exactly one Places call,
 *  so the trial cost stays bounded and predictable. */
export const DEFAULT_CATEGORIES = ['restaurant', 'cafe'];

/** Hard default cap on places stored per run — keeps Google Places spend low. */
export const DEFAULT_MAX_PLACES = 40;

export interface DiscoverRegionOptions {
  categories?: string[];
  maxPlaces?: number;
}

export interface DiscoverRegionSummary {
  found: number;
  stored: number;
  deduped: number;
  placesCalls: number;
}

/** Maps a Google `type` token to our internal category slug. First match wins.
 *  Anything unrecognised falls back to "food" only via the per-category context
 *  (see mapCategorySlug). */
const TYPE_TO_CATEGORY: Array<[RegExp, string]> = [
  [/^(restaurant|cafe|bakery|bar|meal_takeaway|meal_delivery|food)$/, 'food'],
  [/^(supermarket|grocery_or_supermarket|grocery_store|convenience_store)$/, 'grocery'],
  [/^(clothing_store|shoe_store|shopping_mall|store|department_store)$/, 'shopping'],
  [/^(gym|spa|beauty_salon|hair_care)$/, 'health'],
  [/^(movie_theater|night_club|bowling_alley|amusement_park)$/, 'entertainment'],
];

/** The category we searched for, mapped to our slug — used as the fallback when
 *  Google's `types` don't yield a confident match. */
const QUERY_CATEGORY_TO_SLUG: Record<string, string> = {
  restaurant: 'food',
  cafe: 'food',
  bakery: 'food',
  bar: 'food',
  grocery: 'grocery',
  supermarket: 'grocery',
  shopping: 'shopping',
  store: 'shopping',
  gym: 'health',
  entertainment: 'entertainment',
};

function mapCategorySlug(googleTypes: string[], queryCategory: string): string {
  for (const t of googleTypes) {
    for (const [re, slug] of TYPE_TO_CATEGORY) {
      if (re.test(t)) return slug;
    }
  }
  return QUERY_CATEGORY_TO_SLUG[queryCategory] ?? 'food';
}

/**
 * Builds Dealy's local-business inventory by discovering real places within a
 * region's radius via Google Places. Deliberately frugal: one Places call per
 * category, a hard maxPlaces cap that also short-circuits further calls, and
 * upsert-by-googlePlaceId dedup so re-runs refresh rather than duplicate.
 */
@Injectable()
export class PlaceDiscoveryService {
  private readonly logger = new Logger(PlaceDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly places: GooglePlacesService,
  ) {}

  async discoverRegion(
    regionSlug: string,
    opts: DiscoverRegionOptions = {},
  ): Promise<DiscoverRegionSummary> {
    const region = await this.prisma.regionalInventory.findUnique({ where: { regionSlug } });
    if (!region) {
      throw new Error(`No RegionalInventory found for regionSlug "${regionSlug}"`);
    }
    if (region.latitude == null || region.longitude == null) {
      throw new Error(`RegionalInventory "${regionSlug}" has no centroid (latitude/longitude)`);
    }

    const categories = opts.categories?.length ? opts.categories : DEFAULT_CATEGORIES;
    const maxPlaces = opts.maxPlaces ?? DEFAULT_MAX_PLACES;
    const radiusMeters = (region.radiusMiles ?? 10) * MILES_TO_METERS;

    let found = 0;
    let stored = 0;
    let deduped = 0;
    let placesCalls = 0;
    // Track ids seen this run so cross-category overlap counts as a dedupe.
    const seen = new Set<string>();

    for (const category of categories) {
      if (stored >= maxPlaces) break; // cap reached → stop calling Google entirely

      placesCalls++;
      const results = await this.places.nearbySearch({
        query: category,
        latitude: region.latitude,
        longitude: region.longitude,
        radiusMeters,
        includeDetails: true,
      });

      for (const r of results) {
        if (stored >= maxPlaces) break; // stop storing once capped
        found++;
        const isDup = seen.has(r.placeId);
        if (isDup) deduped++;
        seen.add(r.placeId);

        await this.upsertPlace(r, category, region);
        if (!isDup) stored++;
      }
    }

    const summary: DiscoverRegionSummary = { found, stored, deduped, placesCalls };
    this.logger.log(`place-discovery ${regionSlug}: ${JSON.stringify(summary)}`);
    return summary;
  }

  private async upsertPlace(
    r: PlaceResult,
    queryCategory: string,
    region: { regionSlug: string; campusSlug?: string | null },
  ): Promise<void> {
    const googleTypes = r.types ?? [];
    const categorySlug = mapCategorySlug(googleTypes, queryCategory);
    const fields = {
      googlePlaceId: r.placeId,
      name: r.name,
      categorySlug,
      googleTypes,
      address: r.address ?? null,
      latitude: r.latitude,
      longitude: r.longitude,
      priceLevel: r.priceLevel ?? null,
      rating: r.rating ?? null,
      userRatingsTotal: r.userRatingsTotal ?? null,
      website: r.website ?? null,
      phone: r.phone ?? null,
      regionSlug: region.regionSlug,
      campusSlug: region.campusSlug ?? null,
      source: 'google_places',
      // Capture the photo reference now so the (capped) photo job can skip a
      // separate Place Details call later. The resolved URL is set by that job —
      // discovery never resolves/fetches images.
      ...(r.photoReference
        ? { primaryPhotoReference: r.photoReference, photoAttribution: r.photoAttribution ?? null }
        : {}),
    };

    await this.prisma.place.upsert({
      where: { googlePlaceId: r.placeId },
      // On re-discovery refresh the volatile signals; keep identity stable.
      update: {
        name: fields.name,
        categorySlug: fields.categorySlug,
        googleTypes: fields.googleTypes,
        address: fields.address,
        latitude: fields.latitude,
        longitude: fields.longitude,
        priceLevel: fields.priceLevel,
        rating: fields.rating,
        userRatingsTotal: fields.userRatingsTotal,
        website: fields.website,
        phone: fields.phone,
        // Only fill the reference when we have a fresh one — never wipe a stored one.
        ...(r.photoReference
          ? {
              primaryPhotoReference: r.photoReference,
              photoAttribution: r.photoAttribution ?? null,
            }
          : {}),
      },
      create: fields,
    });
  }
}
