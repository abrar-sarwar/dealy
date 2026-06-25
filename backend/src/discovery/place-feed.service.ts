/** Read-only feed-section ranking over ENRICHED places. Reads ONLY stored
 *  Place fields — never calls Gemini. This is the data engine the future feed
 *  endpoint renders; ranking/bucketing live here, UI does not. */

export interface FeedPlace {
  id: string;
  name: string;
  categorySlug: string;
  regionSlug: string;
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
  whyRecommended: string | null;
  website: string | null;
  enrichedAt: Date | null;
}

export interface RankedPlace {
  id: string;
  name: string;
  priceBucket: string | null;
  rating: number | null;
  /** The score (0..1) that placed this entry in its section. */
  score: number;
  whyRecommended: string | null;
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

export interface PlaceFeedPrisma {
  place: {
    findMany(args: unknown): Promise<FeedPlace[]>;
  };
  regionalInventory?: {
    findUnique(
      args: unknown,
    ): Promise<{ latitude: number | null; longitude: number | null } | null>;
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
}
