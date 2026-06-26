/** Read-only feed-section ranking over ENRICHED places. Reads ONLY stored
 *  Place fields — never calls Gemini. This is the data engine the future feed
 *  endpoint renders; ranking/bucketing live here, UI does not. */

export interface FeedPlace {
  id: string;
  name: string;
  categorySlug: string;
  regionSlug: string;
  address: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  userRatingsTotal: number | null;
  priceBucket: string | null;
  studentValueScore: number | null;
  affordabilityScore: number | null;
  dealLikelihoodScore: number | null;
  hiddenGemScore: number | null;
  cheapEatsScore: number | null;
  bestFor: string | null;
  vibeTags: string[];
  confidenceLabel: string | null;
  whyRecommended: string | null;
  budgetTip: string | null;
  website: string | null;
  enrichedAt: Date | null;
  // Real Google Places photo (keyless URL) + status — populated by the photo job.
  primaryPhotoUrl: string | null;
  imageStatus: string;
  feedSectionCandidates: string[];
}

export interface RankedPlace {
  id: string;
  name: string;
  priceBucket: string | null;
  rating: number | null;
  /** The score (0..1) that placed this entry in its section. */
  score: number;
  whyRecommended: string | null;
  /** Gemini money-saving tip ("what to order / how to save here"); nullable. */
  budgetTip: string | null;
  // Enriched detail fields (P4) — let the app render & navigate without a second call.
  categorySlug: string;
  address: string | null;
  latitude: number;
  longitude: number;
  bestFor: string | null;
  vibeTags: string[];
  studentValueScore: number | null;
  confidenceLabel: string | null;
  /** Keyless, client-loadable Google Places photo URL (nullable). */
  primaryPhotoUrl: string | null;
  imageStatus: string;
}

export interface FeedSection {
  key: string;
  title: string;
  places: RankedPlace[];
}

export interface SectionsOptions {
  /** Max places per section. */
  limit?: number;
  /** Region centroid for the distance term; omit to skip distance weighting. */
  center?: { latitude: number; longitude: number };
}

/** Visual kind a map marker renders as — derived from category + top section. */
export type MarkerKind = 'food' | 'cafe' | 'hidden_gem' | 'student' | 'deal' | 'service';

/** A single bounded, map-ready place marker. */
export interface MapMarker {
  id: string;
  name: string;
  categorySlug: string;
  latitude: number;
  longitude: number;
  priceBucket: string | null;
  rating: number | null;
  whyRecommended: string | null;
  /** Gemini money-saving tip ("what to order / how to save here"); nullable. */
  budgetTip: string | null;
  /** Keyless, client-loadable Google Places photo URL (nullable). */
  primaryPhotoUrl: string | null;
  imageStatus: string;
  markerKind: MarkerKind;
}

export interface MapOptions {
  /** Max markers returned (keeps the map uncluttered). Default 40. */
  limit?: number;
  /** Origin for distance ranking + optional radius filter. */
  center?: { latitude: number; longitude: number };
  /** When set with `center`, drop places farther than this many miles. */
  radiusMiles?: number;
}

const DEFAULT_MAP_LIMIT = 40;

/** Derive the marker's visual kind from its top feed-section candidate, then category. */
function deriveMarkerKind(p: FeedPlace): MarkerKind {
  const top = p.feedSectionCandidates?.[0];
  switch (top) {
    case 'hidden_gem':
      return 'hidden_gem';
    case 'student_friendly':
      return 'student';
    case 'worth_checking_deals':
      return 'deal';
    case 'cheap_eats':
      return 'food';
    default:
      break;
  }
  const cat = p.categorySlug;
  if (cat === 'cafe' || cat === 'coffee') return 'cafe';
  if (cat === 'food' || cat === 'restaurant') return 'food';
  if (cat === 'services' || cat === 'service') return 'service';
  return 'food';
}

export interface PlaceFeedPrisma {
  place: {
    findMany(args: unknown): Promise<FeedPlace[]>;
  };
  regionalInventory?: {
    findUnique(
      args: unknown,
    ): Promise<{ latitude: number | null; longitude: number | null } | null>;
    findMany?(
      args?: unknown,
    ): Promise<{ regionSlug: string; latitude: number | null; longitude: number | null }[]>;
  };
}

const DEFAULT_LIMIT = 10;
const MIN_REVIEWS_HIGHLY_RATED = 50;
const MIN_REVIEWS_HIDDEN_GEM = 5;

function isFood(p: FeedPlace): boolean {
  return p.categorySlug === 'food';
}

function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Normalised rating term in [0,1] (Google scale 0–5). */
function ratingTerm(rating: number | null): number {
  if (rating == null) return 0;
  return Math.max(0, Math.min(1, rating / 5));
}

/** Distance term in [0,1]: 1 at the centroid, decaying to 0 by ~15 miles. */
function distanceTerm(p: FeedPlace, center?: { latitude: number; longitude: number }): number {
  if (!center) return 0;
  const miles = haversineMiles(center, p);
  return Math.max(0, 1 - miles / 15);
}

/** Composite = relevant score (weighted) + rating + small distance nudge. */
function composite(
  primary: number,
  p: FeedPlace,
  center?: { latitude: number; longitude: number },
): number {
  return 0.6 * primary + 0.3 * ratingTerm(p.rating) + 0.1 * distanceTerm(p, center);
}

export class PlaceFeedService {
  constructor(private readonly prisma: PlaceFeedPrisma) {}

  /**
   * Resolve the nearest region slug to a coordinate by comparing against
   * RegionalInventory centroids. Returns null if no region has a centroid.
   */
  async resolveRegion(point: { latitude: number; longitude: number }): Promise<string | null> {
    const inv = this.prisma.regionalInventory;
    if (!inv?.findMany) return null;
    const regions = await inv.findMany();
    let best: { slug: string; miles: number } | null = null;
    for (const r of regions) {
      if (r.latitude == null || r.longitude == null) continue;
      const miles = haversineMiles(point, { latitude: r.latitude, longitude: r.longitude });
      if (!best || miles < best.miles) best = { slug: r.regionSlug, miles };
    }
    return best?.slug ?? null;
  }

  async sections(regionSlug: string, opts: SectionsOptions = {}): Promise<FeedSection[]> {
    const limit = opts.limit ?? DEFAULT_LIMIT;

    // Read ONLY stored fields for enriched places in this region. Zero Gemini.
    const places = (await this.prisma.place.findMany({
      where: { regionSlug, enrichedAt: { not: null } },
    })) as FeedPlace[];

    let center = opts.center;
    if (!center && this.prisma.regionalInventory) {
      const region = await this.prisma.regionalInventory.findUnique({ where: { regionSlug } });
      if (region?.latitude != null && region.longitude != null) {
        center = { latitude: region.latitude, longitude: region.longitude };
      }
    }

    const build = (
      key: string,
      title: string,
      eligible: (p: FeedPlace) => boolean,
      primary: (p: FeedPlace) => number,
    ): FeedSection => {
      const ranked = places
        .filter((p) => eligible(p) && primary(p) > 0)
        .map((p) => ({ p, score: composite(primary(p), p, center) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ p, score }) => ({
          id: p.id,
          name: p.name,
          priceBucket: p.priceBucket,
          rating: p.rating,
          score,
          whyRecommended: p.whyRecommended,
          budgetTip: p.budgetTip,
          categorySlug: p.categorySlug,
          address: p.address,
          latitude: p.latitude,
          longitude: p.longitude,
          bestFor: p.bestFor,
          vibeTags: p.vibeTags ?? [],
          studentValueScore: p.studentValueScore,
          confidenceLabel: p.confidenceLabel,
          primaryPhotoUrl: p.primaryPhotoUrl,
          imageStatus: p.imageStatus,
        }));
      return { key, title, places: ranked };
    };

    return [
      build(
        'cheap_eats',
        `Best cheap eats near ${regionSlug}`,
        (p) => isFood(p) && (p.rating ?? 0) >= 3.5,
        (p) => 0.7 * (p.cheapEatsScore ?? 0) + 0.3 * (p.affordabilityScore ?? 0),
      ),
      build(
        'hidden_gem',
        `Hidden gems near ${regionSlug}`,
        (p) => (p.userRatingsTotal ?? 0) >= MIN_REVIEWS_HIDDEN_GEM,
        (p) => p.hiddenGemScore ?? 0,
      ),
      build(
        'highly_rated',
        'Highly rated nearby',
        (p) => (p.userRatingsTotal ?? 0) >= MIN_REVIEWS_HIGHLY_RATED,
        (p) => ratingTerm(p.rating),
      ),
      build(
        'student_friendly',
        'Student-friendly spots',
        () => true,
        (p) => p.studentValueScore ?? 0,
      ),
      build(
        'worth_checking_deals',
        'Worth checking for deals',
        (p) => p.website != null,
        (p) => p.dealLikelihoodScore ?? 0,
      ),
    ];
  }

  /**
   * Bounded, map-ready markers for a region. Reads ONLY stored Place fields —
   * zero Gemini, zero live photo fetching (the stored keyless `primaryPhotoUrl`
   * is used as-is). Ranked by distance + rating + value scores and capped so the
   * map stays uncluttered.
   */
  async mapMarkers(regionSlug: string, opts: MapOptions = {}): Promise<MapMarker[]> {
    const limit = opts.limit ?? DEFAULT_MAP_LIMIT;

    const places = (await this.prisma.place.findMany({
      where: { regionSlug, enrichedAt: { not: null } },
    })) as FeedPlace[];

    let center = opts.center;
    if (!center && this.prisma.regionalInventory) {
      const region = await this.prisma.regionalInventory.findUnique({ where: { regionSlug } });
      if (region?.latitude != null && region.longitude != null) {
        center = { latitude: region.latitude, longitude: region.longitude };
      }
    }

    // Optional hard radius filter (only meaningful with a center).
    const within =
      center && opts.radiusMiles != null
        ? places.filter((p) => haversineMiles(center!, p) <= opts.radiusMiles!)
        : places;

    // Composite map value: distance (when centered) + rating + best value score.
    const valueScore = (p: FeedPlace): number => {
      const best = Math.max(
        p.cheapEatsScore ?? 0,
        p.hiddenGemScore ?? 0,
        p.studentValueScore ?? 0,
        p.dealLikelihoodScore ?? 0,
      );
      return 0.45 * distanceTerm(p, center) + 0.35 * ratingTerm(p.rating) + 0.2 * best;
    };

    return within
      .map((p) => ({ p, score: valueScore(p) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ p }) => ({
        id: p.id,
        name: p.name,
        categorySlug: p.categorySlug,
        latitude: p.latitude,
        longitude: p.longitude,
        priceBucket: p.priceBucket,
        rating: p.rating,
        whyRecommended: p.whyRecommended,
        budgetTip: p.budgetTip,
        primaryPhotoUrl: p.primaryPhotoUrl,
        imageStatus: p.imageStatus,
        markerKind: deriveMarkerKind(p),
      }));
  }
}
