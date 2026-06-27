/**
 * Internal types for the Smart Basket grocery engine. These are NOT the wire
 * DTOs (see grocery.dto.ts) — they are the in-memory shapes the deterministic
 * catalog + recommendation services pass around. Money is in minor units.
 */

/** Trust label shared with the wire contract. */
export type TrustLabel = 'verified' | 'source_backed' | 'estimated' | 'user_reported' | 'mock';

/** Confidence band shared with the wire contract. */
export type Confidence = 'low' | 'medium' | 'high';

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
