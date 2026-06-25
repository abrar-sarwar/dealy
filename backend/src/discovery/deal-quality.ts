/**
 * Inputs for the pure deal-quality score. All Gemini-supplied signals describe
 * the REAL scraped offer — the score never fabricates value, it only ranks the
 * concreteness/relevance/locality of offers Gemini actually extracted.
 */
export interface QualityScoreInput {
  /** 0..1 — 1 = a specific discount ("20% off", "$5 burger"); 0 = no terms. */
  concreteOfferScore: number;
  /** 0..1 — how relevant the offer is to the area/category goal. */
  areaRelevance: number;
  /** true for "Special Offer"/"Purchase a Gift Card"/no concrete benefit. */
  isVague: boolean;
  /** Resolved category slug for the candidate. */
  categorySlug: string;
  /** Campus deal type ('dining'|'ticket'|…|'other'|null). */
  campusDealType?: string | null;
  /** 'exact' coords rank above 'approximate'. */
  locationPrecision: string;
  /** Whether a real product/food/merchant image was captured. */
  hasImage: boolean;
  /** Source reliability 0..100. */
  reliabilityScore: number;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Consumer-surface categories that read as genuinely useful local offers. */
const STRONG_CATEGORIES = new Set(['food', 'restaurant', 'restaurants', 'groceries', 'dining']);

/**
 * Compute a 0..100 deal-quality score. Concreteness dominates; area relevance is
 * the second lever; category/locality/image/reliability are smaller boosts; a
 * vagueness penalty pushes "Purchase a Gift Card"-tier junk to the bottom.
 *
 * Pure + deterministic — unit-tested, no I/O.
 */
export function computeQualityScore(input: QualityScoreInput): number {
  const concrete = clamp01(input.concreteOfferScore);
  const relevance = clamp01(input.areaRelevance);

  // Concreteness is the dominant lever (up to 55 pts).
  let score = concrete * 55;
  // Area relevance is the second lever (up to 20 pts).
  score += relevance * 20;

  // Category boost: food/restaurant/grocery/dining read as real consumer value;
  // a generic 'other' campus deal type or vague services tier earns nothing here.
  const cat = (input.categorySlug ?? '').toLowerCase();
  const isStrongCat = STRONG_CATEGORIES.has(cat) || input.campusDealType === 'dining';
  const isWeakType = input.campusDealType === 'other';
  if (isStrongCat) score += 8;
  else if (!isWeakType) score += 3;

  // Exact location is more actionable than an approximate centroid.
  if (input.locationPrecision === 'exact') score += 6;

  // A real product/food image lifts the card.
  if (input.hasImage) score += 4;

  // Source reliability (up to 7 pts).
  score += clamp01(input.reliabilityScore / 100) * 7;

  // Vagueness penalty: "Special Offer"/"Gift Card" with no concrete benefit.
  if (input.isVague) score -= 35;

  return Math.max(0, Math.min(100, Math.round(score)));
}
