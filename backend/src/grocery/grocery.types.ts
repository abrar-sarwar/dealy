/**
 * Internal types for the Smart Basket grocery engine. These are NOT the wire
 * DTOs (see grocery.dto.ts) — they are the in-memory shapes the deterministic
 * catalog + recommendation services pass around. Money is in minor units.
 */

/**
 * Trust label shared with the wire contract (backend + iOS must match). iOS maps
 * all of these; unknown → estimated.
 */
export type TrustLabel =
  | 'verified'
  | 'source_backed'
  | 'estimated'
  | 'gemini_tip'
  | 'manual_curated'
  | 'low_confidence'
  | 'needs_verification'
  | 'user_reported'
  | 'mock';

/** Confidence band shared with the wire contract. */
export type Confidence = 'low' | 'medium' | 'high';

/** Days within which a verified deal is still considered "fresh". */
const RECENT_VERIFY_DAYS = 7;
/** Extracted-deal confidence score below which we label it low_confidence. */
const LOW_CONFIDENCE_SCORE = 40;

/** Minimal deal shape the trust mapper reads (keeps it pure + DB-free testable). */
export interface DealTrustLike {
  sourceTrust: string;
  verificationStatus: string;
  lastVerifiedAt: Date | null;
  confidenceScore?: number | null;
}

export interface DealTrust {
  confidence: number;
  label: TrustLabel;
  band: Confidence;
}

/**
 * Map a deal's provenance/verification/recency to a wire trust label + band
 * (BH6). Pure — shared by Smart Basket items and Food Run matched deals so both
 * surfaces emit the same taxonomy:
 *   authoritative+verified → verified
 *   authoritative / editorial-verified → source_backed
 *   editorial pending/unreachable → needs_verification
 *   editorial invalid/expired or low score → low_confidence
 *   fixture → mock
 */
export function dealTrust(deal: DealTrustLike): DealTrust {
  const verified = deal.sourceTrust === 'authoritative' && deal.verificationStatus === 'verified';
  const recent =
    deal.lastVerifiedAt != null &&
    Date.now() - deal.lastVerifiedAt.getTime() <= RECENT_VERIFY_DAYS * 24 * 60 * 60 * 1000;
  if (verified) {
    return recent
      ? { confidence: 0.95, label: 'verified', band: 'high' }
      : { confidence: 0.8, label: 'verified', band: 'high' };
  }
  if (deal.sourceTrust === 'fixture') {
    return { confidence: 0.2, label: 'mock', band: 'low' };
  }
  if (deal.sourceTrust === 'authoritative') {
    return { confidence: 0.6, label: 'source_backed', band: 'medium' };
  }
  if (deal.verificationStatus === 'verified') {
    return { confidence: 0.55, label: 'source_backed', band: 'medium' };
  }
  const lowScore = deal.confidenceScore != null && deal.confidenceScore < LOW_CONFIDENCE_SCORE;
  if (deal.verificationStatus === 'invalid' || deal.verificationStatus === 'expired' || lowScore) {
    return { confidence: 0.25, label: 'low_confidence', band: 'low' };
  }
  return { confidence: 0.4, label: 'needs_verification', band: 'low' };
}

/** Goal enum (wire `goal`). */
export type BasketGoal =
  | 'cheapest'
  | 'meal_prep'
  | 'high_protein'
  | 'dorm_snacks'
  | 'breakfast'
  | 'quick_meals'
  | 'healthy'
  | 'party'
  | 'custom';

/** Timeframe enum (wire `timeframe`). */
export type BasketTimeframe = 'today' | '3_days' | '1_week';

/** Dietary preference enum (wire `dietary[]`). */
export type DietaryPreference =
  | 'vegetarian'
  | 'halal'
  | 'high_protein'
  | 'low_prep'
  | 'no_cooking'
  | 'healthy'
  | 'bulk_value'
  | 'snacks_drinks';

/** A staple as loaded from the seeded catalog (per-unit estimate). */
export interface CatalogStaple {
  slug: string;
  name: string;
  category: string;
  unit: string;
  defaultQuantity: number;
  estimatedPriceMinor: number; // per defaultQuantity unit
  dietaryTags: string[];
  goalAffinities: string[];
  prepLevel: string;
}

/** A selected basket line — `estimatedPriceMinor` is the LINE TOTAL (unit × qty). */
export interface BasketLineItem {
  slug: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  /** Baseline estimated line-total in minor units (no deal applied). */
  estimatedPriceMinor: number;
  /** Cheaper affinity-matched swaps the user could pick instead. */
  substitutionOptions: string[];
}

/** What a store offers for one basket staple (a store may only stock a subset). */
export interface StoreOffer {
  slug: string;
  /** Line-total price at this store, minor units. */
  priceMinor: number;
  /** Id of the real published Deal backing this offer, if any. */
  matchedDealId?: string | null;
  /** 0..1 deal trust (source + verification + recency). 0 = plain estimate. */
  dealConfidence: number;
}

/** A candidate store the engine can route the basket to. */
export interface CandidateStore {
  name: string;
  placeId: string | null;
  /** Provenance: a real grocery Deal, a Places grocery row, or the known list. */
  kind: 'deal' | 'place' | 'known';
  distanceMiles: number | null;
  /** Coordinates of the store (from its Place/Deal) when known — null for the
   *  known-store fallback list (BH8). Flows through to the store rec for mapping. */
  latitude: number | null;
  longitude: number | null;
  /** Per-staple offers. Items absent here are NOT stocked by this store. */
  offers: StoreOffer[];
}

/** A scored store with the per-term breakdown used to rank it. */
export interface StoreScore {
  store: CandidateStore;
  score: number;
  itemMatchRate: number;
  coveredSlugs: string[];
  estimatedTotalMinor: number;
  estimatedSavingsMinor: number;
  dealConfidence: number;
  distanceMiles: number | null;
}

/** Output of the ranking brain. */
export interface RecommendationResult {
  bestStore: StoreScore | null;
  secondStop: StoreScore | null;
  confidence: Confidence;
  /** Slugs not covered by the chosen store(s). */
  missingItems: string[];
  routeSummary: string;
}

/** Options that shape ranking. */
export interface RankOptions {
  budgetMinor: number;
  maxDistanceMiles: number;
  allowSecondStop: boolean;
}
