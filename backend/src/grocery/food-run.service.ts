import { Injectable, Logger } from '@nestjs/common';
import type { Deal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PlaceFeedService } from '../discovery/place-feed.service';
import { dealTrust } from './grocery.types';
import type { FoodRunDto, FoodRunPlaceDto } from './grocery.dto';

const EARTH_RADIUS_MILES = 3958.7613;
const DEFAULT_RADIUS_MILES = 15;
const DEFAULT_MAX_DISTANCE_MILES = 10;
const MAX_ALTERNATIVES = 4;
const NO_BUDGET_EXPENSIVE_THRESHOLD = 25; // dollars
const WORTH_THE_WALK_MILES = 1.5;
/** Short-TTL result cache to absorb repeat taps on the same query (BH2). */
const RESULT_CACHE_TTL_MS = 120_000;

/**
 * Food Run v2 goals. Includes the 13 public goals plus the legacy `closest_cheap`
 * intent (kept as an alias so older clients + existing unit tests keep working).
 */
export type FoodRunGoal =
  | 'under_10'
  | 'cheapest'
  | 'high_protein'
  | 'quick_lunch'
  | 'late_night'
  | 'study_spot'
  | 'coffee_dessert'
  | 'date_friends'
  | 'group_meal'
  | 'best_value'
  | 'pickup_deal'
  | 'student_friendly'
  | 'custom'
  | 'closest_cheap';

/** @deprecated use {@link FoodRunGoal}. Kept for back-compat. */
export type FoodRunIntent = FoodRunGoal;

export type FoodRunTimeOfDay = 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'late_night';
export type FoodRunVibe = 'quick' | 'filling' | 'healthy' | 'comfort' | 'social' | 'quiet';
export type FoodRunDietary = 'vegetarian' | 'halal' | 'high_protein' | 'healthy';

/**
 * Small known-chain name list. Matched case-insensitively as a substring of the
 * place name. Heuristic only — drives the allowChains / allowLocal filters.
 */
const KNOWN_CHAINS = [
  'mcdonald',
  'burger king',
  'wendy',
  'taco bell',
  'chick-fil-a',
  'chick fil a',
  'chipotle',
  'subway',
  'starbucks',
  'dunkin',
  'kfc',
  'popeyes',
  'domino', // Domino's
  'pizza hut',
  'panera',
  'five guys',
  'shake shack',
  'raising cane',
  'wingstop',
  'panda express',
  'sonic',
  'arby',
  'jersey mike',
  'jimmy john',
  'zaxby',
  'waffle house',
  'ihop',
  'dairy queen',
  'papa john',
  'little caesar',
  'qdoba',
  "moe's",
  'firehouse subs',
  'dennys',
  "denny's",
  'olive garden',
  'applebee',
  'chilis',
  "chili's",
] as const;

/** The stored Place fields the ranking reads (no live AI, no photo fetch). */
export interface FoodRunPlace {
  id: string;
  name: string;
  categorySlug: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  priceBucket: string | null;
  affordabilityScore: number | null;
  cheapEatsScore: number | null;
  studentValueScore: number | null;
  hiddenGemScore: number | null;
  dealLikelihoodScore: number | null;
  bestFor: string | null;
  vibeTags: string[];
  categoryTags: string[];
  whyRecommended: string | null;
  budgetTip: string | null;
  primaryPhotoUrl: string | null;
  curatedStudentFriendly: boolean;
  /** Provenance: google_places | manual | ... — drives the manual_curated label. */
  source?: string | null;
  // Launch Region Data Hardening signals (BH3). All optional — older callers /
  // unenriched rows leave them null and the engine falls back to prior behaviour.
  lateNight?: boolean | null;
  studySpot?: boolean | null;
  chainClassification?: string | null;
  estimatedMealMinMinor?: number | null;
  estimatedMealMaxMinor?: number | null;
  recommendedOrder?: string | null;
  launchRegionPriority?: number | null;
}

/** Tunable knobs for the pure ranking (all optional → safe defaults). */
export interface FoodRunRankOptions {
  budgetMinor?: number | null;
  maxDistanceMiles?: number | null;
  timeOfDay?: FoodRunTimeOfDay | null;
  vibe?: FoodRunVibe | null;
  dietary?: FoodRunDietary[];
  allowChains?: boolean;
  allowLocal?: boolean;
  /** When false, applies the low-confidence penalty (outside known region). */
  inRegion?: boolean;
}

export interface FoodRunInput {
  latitude: number;
  longitude: number;
  region?: string | null;
  goal: FoodRunGoal;
  budgetMinor?: number | null;
  maxDistanceMiles?: number | null;
  timeOfDay?: FoodRunTimeOfDay | null;
  vibe?: FoodRunVibe | null;
  dietary?: FoodRunDietary[];
  allowChains?: boolean;
  allowLocal?: boolean;
}

interface ScoredPlace {
  place: FoodRunPlace;
  score: number;
}

function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

function ratingTerm(rating: number | null): number {
  if (rating == null) return 0;
  return Math.max(0, Math.min(1, rating / 5));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function hasTag(tags: string[], needles: string[]): boolean {
  const lc = tags.map((t) => t.toLowerCase());
  return needles.some((n) => lc.some((t) => t.includes(n)));
}

function placeTags(p: FoodRunPlace): string[] {
  return [...p.vibeTags, ...p.categoryTags, p.bestFor ?? '', p.categorySlug];
}

function priceBucketCost(bucket: string | null): number {
  switch (bucket) {
    case '$':
      return 8;
    case '$$':
      return 15;
    case '$$$':
      return 30;
    case '$$$$':
      return 50;
    default:
      return 12;
  }
}

function isChain(name: string): boolean {
  const lc = name.toLowerCase();
  return KNOWN_CHAINS.some((c) => lc.includes(c));
}

/**
 * Chain/local decision (BH3): the stored `chainClassification` wins when known;
 * `unknown`/missing falls back to the known-chain name heuristic.
 */
function placeIsChain(p: FoodRunPlace): boolean {
  if (p.chainClassification === 'chain') return true;
  if (p.chainClassification === 'local') return false;
  return isChain(p.name);
}

/**
 * Estimated per-meal cost in dollars (BH3): prefer the stored
 * estimatedMealMin/MaxMinor (midpoint) when present, else the price-bucket proxy.
 */
function estimatedCostDollars(p: FoodRunPlace): number {
  const min = p.estimatedMealMinMinor;
  const max = p.estimatedMealMaxMinor;
  if (min != null && max != null) return (min + max) / 2 / 100;
  if (max != null) return max / 100;
  if (min != null) return min / 100;
  return priceBucketCost(p.priceBucket);
}

/** budgetFit: 1 when est ≤ budget, decays above; 0.5 neutral when no budget. */
function budgetFitScore(estCostDollars: number, budgetDollars: number | null): number {
  if (budgetDollars == null) return 0.5;
  if (estCostDollars <= budgetDollars) return 1;
  return clamp01(1 - (estCostDollars - budgetDollars) / budgetDollars);
}

/** distance: 1 near, linear decay to 0 at maxDistance (default 10mi). */
function distanceScore(miles: number, maxDistanceMiles: number): number {
  return clamp01(1 - miles / Math.max(0.1, maxDistanceMiles));
}

/**
 * Honest open-now heuristic — there are NO stored store hours. Derived from the
 * requested timeOfDay + late/breakfast tags. Neutral 0.5 when timeOfDay unknown.
 * Documented as an estimate; never claimed as real "open now".
 */
function openNowScore(p: FoodRunPlace, timeOfDay: FoodRunTimeOfDay | null | undefined): number {
  if (!timeOfDay) return 0.5;
  const tags = placeTags(p);
  const isCafe = p.categorySlug === 'cafe' || p.categorySlug === 'coffee';
  const lateLeaning =
    p.lateNight === true || hasTag(tags, ['late', 'night', '24', 'open_late', 'bar']);
  const breakfastLeaning = hasTag(tags, ['breakfast', 'brunch', 'coffee', 'cafe', 'bakery']);
  switch (timeOfDay) {
    case 'morning':
      return breakfastLeaning || isCafe ? 0.9 : 0.4;
    case 'lunch':
      return lateLeaning && !breakfastLeaning ? 0.6 : 0.85;
    case 'afternoon':
      return 0.7;
    case 'dinner':
      return breakfastLeaning && !lateLeaning ? 0.55 : 0.85;
    case 'late_night':
      return lateLeaning ? 0.95 : 0.3;
    default:
      return 0.5;
  }
}

/** Per-goal affinity in [0,1] — the primary signal blended into the score. */
function goalAffinityScore(p: FoodRunPlace, goal: FoodRunGoal, dist: number): number {
  const afford = p.affordabilityScore ?? 0;
  const cheap = p.cheapEatsScore ?? 0;
  const student = p.studentValueScore ?? 0;
  const rate = ratingTerm(p.rating);
  const dealLikely = p.dealLikelihoodScore ?? 0;
  const cheapBucket = p.priceBucket === '$' ? 1 : p.priceBucket === '$$' ? 0.5 : 0;
  const tags = placeTags(p);

  switch (goal) {
    case 'under_10':
      return clamp01(0.5 * cheap + 0.3 * afford + 0.2 * cheapBucket);
    case 'cheapest':
      return clamp01(0.6 * afford + 0.4 * cheap);
    case 'closest_cheap':
      return clamp01(0.5 * dist + 0.3 * afford + 0.2 * cheapBucket);
    case 'high_protein':
      return clamp01(
        0.6 * (hasTag(tags, ['protein', 'grill', 'bowl', 'meat', 'chicken', 'steak']) ? 1 : 0) +
          0.4 * student,
      );
    case 'quick_lunch':
      return clamp01(
        0.45 * cheap +
          0.35 * dist +
          0.2 * (hasTag(tags, ['fast', 'quick', 'lunch', 'counter']) ? 1 : 0),
      );
    case 'late_night':
      return p.lateNight === true || hasTag(tags, ['late', 'night', 'open_late', '24', 'bar'])
        ? 1
        : 0.1;
    case 'study_spot':
      return clamp01(
        0.45 * (p.studySpot === true || hasTag(tags, ['study', 'wifi', 'quiet']) ? 1 : 0) +
          0.2 * (hasTag(tags, ['cafe', 'coffee']) ? 1 : 0) +
          0.2 * (p.categorySlug === 'cafe' || p.categorySlug === 'coffee' ? 1 : 0) +
          0.15 * rate,
      );
    case 'coffee_dessert':
      return clamp01(
        0.7 *
          (p.categorySlug === 'cafe' || p.categorySlug === 'coffee'
            ? 1
            : hasTag(tags, ['coffee', 'cafe', 'dessert', 'bakery', 'ice cream', 'sweet', 'pastry'])
              ? 1
              : 0) +
          0.3 * rate,
      );
    case 'date_friends':
      return clamp01(
        0.6 * (hasTag(tags, ['date', 'cozy', 'group', 'vibe', 'romantic', 'cocktail']) ? 1 : 0) +
          0.4 * rate,
      );
    case 'group_meal':
      return clamp01(
        0.5 *
          (hasTag(tags, ['group', 'share', 'shareable', 'filling', 'family', 'platter']) ? 1 : 0) +
          0.5 * afford,
      );
    case 'best_value':
      return clamp01(rate * (afford > 0 ? afford : 0.5));
    case 'pickup_deal':
      return clamp01(dealLikely);
    case 'student_friendly':
      return clamp01(0.6 * student + 0.4 * (p.curatedStudentFriendly ? 1 : 0));
    case 'custom':
    default:
      return clamp01(0.5 * rate + 0.5 * dist);
  }
}

/** Small soft-preference bonus (≤0.06) for matching dietary tags. Never excludes. */
function dietaryBonus(p: FoodRunPlace, dietary: FoodRunDietary[] | undefined): number {
  if (!dietary || dietary.length === 0) return 0;
  const tags = placeTags(p);
  const matchers: Record<FoodRunDietary, string[]> = {
    vegetarian: ['vegetarian', 'vegan', 'veggie', 'plant'],
    halal: ['halal'],
    high_protein: ['protein', 'grill', 'meat', 'chicken', 'bowl', 'steak'],
    healthy: ['healthy', 'salad', 'fresh', 'bowl', 'wholesome'],
  };
  let matched = 0;
  for (const d of dietary) if (hasTag(tags, matchers[d])) matched += 1;
  return Math.min(0.06, matched * 0.03);
}

/**
 * Cheap Food Run: pick the single best place for a goal from stored Places.
 * Read-only, deterministic, NO live AI. `rankPlaces` / `scorePlace` are pure and
 * unit-tested (pass a places array; no DB needed).
 */
@Injectable()
export class FoodRunService {
  private readonly logger = new Logger(FoodRunService.name);
  /** key → cached result. Bounded by TTL; keyed on rounded coords + params. */
  private readonly resultCache = new Map<string, { value: FoodRunDto; expiresMs: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly placeFeed: PlaceFeedService,
  ) {}

  /** Cache key: round(lat,3)|round(lng,3)|goal|budget|maxDist (BH2). */
  private cacheKey(input: FoodRunInput): string {
    const r3 = (n: number): string => n.toFixed(3);
    return [
      r3(input.latitude),
      r3(input.longitude),
      input.goal,
      input.budgetMinor ?? '',
      input.maxDistanceMiles ?? '',
    ].join('|');
  }

  /**
   * Pure goal ranking over a places array (highest score first). Applies the
   * maxDistance / allowChains / allowLocal hard filters; dietary is a soft
   * preference (never excludes). Backward compatible: the legacy 3-arg call
   * `rankPlaces(places, goal, center)` still works.
   */
  rankPlaces(
    places: FoodRunPlace[],
    goal: FoodRunGoal,
    center: { latitude: number; longitude: number },
    opts: FoodRunRankOptions = {},
  ): ScoredPlace[] {
    const maxDistance = opts.maxDistanceMiles ?? DEFAULT_MAX_DISTANCE_MILES;
    const allowChains = opts.allowChains ?? true;
    const allowLocal = opts.allowLocal ?? true;

    return places
      .filter((p) => {
        if (haversineMiles(center, p) > maxDistance) return false;
        const chain = placeIsChain(p);
        if (!allowChains && chain) return false;
        if (!allowLocal && !chain) return false;
        return true;
      })
      .map((place) => ({ place, score: this.scorePlace(place, goal, center, opts) }))
      .sort((a, b) => b.score - a.score || ratingTerm(b.place.rating) - ratingTerm(a.place.rating));
  }

  /** Pure restaurant_score for one place (see docs/spec §3 for the weights). */
  private scorePlace(
    p: FoodRunPlace,
    goal: FoodRunGoal,
    center: { latitude: number; longitude: number },
    opts: FoodRunRankOptions = {},
  ): number {
    const maxDistance = opts.maxDistanceMiles ?? DEFAULT_MAX_DISTANCE_MILES;
    const budgetDollars = opts.budgetMinor != null ? opts.budgetMinor / 100 : null;
    const miles = haversineMiles(center, p);
    const estCost = estimatedCostDollars(p);

    const dist = distanceScore(miles, maxDistance);
    const budgetFit = budgetFitScore(estCost, budgetDollars);
    const rate = ratingTerm(p.rating);
    const student = p.curatedStudentFriendly
      ? Math.max(0.8, p.studentValueScore ?? 0)
      : (p.studentValueScore ?? 0);
    const dealMatch = p.dealLikelihoodScore ?? 0; // proxy; verified deal attached later
    const openNow = openNowScore(p, opts.timeOfDay);
    const goalAffinity = goalAffinityScore(p, goal, dist);

    const effectiveBudget = budgetDollars ?? NO_BUDGET_EXPENSIVE_THRESHOLD;
    const expensivePenalty = estCost > effectiveBudget ? 0.15 : 0;
    const lowConfidencePenalty = opts.inRegion === false || p.affordabilityScore == null ? 0.1 : 0;

    // Small additive tiebreak for launch-region priority places (BH3). Capped so
    // it only separates otherwise-comparable picks, never dominates the score.
    const priorityBoost = Math.min(0.05, Math.max(0, p.launchRegionPriority ?? 0) * 0.01);

    const base =
      budgetFit * 0.2 +
      rate * 0.18 +
      dist * 0.16 +
      clamp01(student) * 0.16 +
      clamp01(dealMatch) * 0.12 +
      openNow * 0.1 +
      goalAffinity * 0.08 -
      expensivePenalty -
      lowConfidencePenalty +
      priorityBoost;

    return base + dietaryBonus(p, opts.dietary);
  }

  /**
   * Public entry: short-TTL cached over {@link computeBestPlace} to absorb repeat
   * taps, with one structured log line per call (region/goal/confidence/etc.).
   */
  async bestPlace(input: FoodRunInput): Promise<FoodRunDto> {
    const start = Date.now();
    const key = this.cacheKey(input);
    const now = Date.now();
    const cached = this.resultCache.get(key);
    if (cached && cached.expiresMs > now) {
      this.logger.log({
        msg: 'food_run.bestPlace',
        region: input.region ?? null,
        goal: input.goal,
        confidence: cached.value.confidence,
        sourceStatus: cached.value.source_status,
        placeCount: cached.value.place ? 1 + cached.value.ranked_alternatives.length : 0,
        durationMs: Date.now() - start,
        cacheHit: true,
      });
      return cached.value;
    }

    const result = await this.computeBestPlace(input);
    this.resultCache.set(key, { value: result, expiresMs: now + RESULT_CACHE_TTL_MS });
    this.pruneCache(now);

    this.logger.log({
      msg: 'food_run.bestPlace',
      region: input.region ?? null,
      goal: input.goal,
      confidence: result.confidence,
      sourceStatus: result.source_status,
      placeCount: result.place ? 1 + result.ranked_alternatives.length : 0,
      durationMs: Date.now() - start,
      cacheHit: false,
    });
    return result;
  }

  /** Drop expired cache entries (called on each miss; cheap, bounded). */
  private pruneCache(now: number): void {
    for (const [k, v] of this.resultCache) {
      if (v.expiresMs <= now) this.resultCache.delete(k);
    }
  }

  /** Resolve region, rank Places, attach a nearby food deal, and shape the DTO. */
  private async computeBestPlace(input: FoodRunInput): Promise<FoodRunDto> {
    const center = { latitude: input.latitude, longitude: input.longitude };
    const regionSlug = input.region ?? (await this.placeFeed.resolveRegion(center)) ?? null;
    const inRegion = regionSlug != null;
    const budgetDollars = input.budgetMinor != null ? input.budgetMinor / 100 : null;

    const places = await this.loadPlaces(regionSlug);
    if (places.length === 0) {
      return {
        place: null,
        ranked_alternatives: [],
        estimated_cost: budgetDollars ?? 0,
        recommended_order: null,
        reason: 'No places found nearby yet — try requesting your zone.',
        ranking_label: 'Best overall',
        matched_deal: null,
        confidence: 'low',
        tags: [],
        source_status: 'estimated',
      };
    }

    const opts: FoodRunRankOptions = {
      budgetMinor: input.budgetMinor ?? null,
      maxDistanceMiles: input.maxDistanceMiles ?? null,
      timeOfDay: input.timeOfDay ?? null,
      vibe: input.vibe ?? null,
      dietary: input.dietary ?? [],
      allowChains: input.allowChains ?? true,
      allowLocal: input.allowLocal ?? true,
      inRegion,
    };

    // Primary ranking with all filters. If filters leave nothing (e.g. out of
    // area), fall back to an unfiltered ranking so we always return the best
    // available place — at low confidence.
    let ranked = this.rankPlaces(places, input.goal, center, opts);
    let filtered = true;
    if (ranked.length === 0) {
      ranked = this.rankPlaces(places, input.goal, center, {
        ...opts,
        maxDistanceMiles: Number.POSITIVE_INFINITY,
        allowChains: true,
        allowLocal: true,
        inRegion: false,
      });
      filtered = false;
    }

    const top = ranked[0].place;
    const miles = haversineMiles(center, top);
    const topEstCost = estimatedCostDollars(top);

    const deal = await this.nearbyFoodDeal(top);
    const sourceStatus = this.deriveSourceStatus(top, deal);

    const withinDistance = miles <= (input.maxDistanceMiles ?? DEFAULT_RADIUS_MILES);
    const sourceBacked = sourceStatus === 'verified' || sourceStatus === 'source_backed';
    const confidence = sourceBacked
      ? 'high'
      : inRegion && filtered && withinDistance
        ? 'medium'
        : 'low';

    const topTags = this.deriveTags(top, topEstCost, deal != null);

    return {
      place: this.mapPlaceDto(top, center, topEstCost, deal != null),
      ranked_alternatives: ranked
        .slice(1, 1 + MAX_ALTERNATIVES)
        .map(({ place }) => this.mapPlaceDto(place, center, estimatedCostDollars(place), false)),
      estimated_cost: topEstCost,
      // recommendedOrder (curated/enriched) overrides the generic budget tip (BH3).
      recommended_order: top.recommendedOrder ?? top.budgetTip ?? null,
      reason: this.reason(input.goal, miles),
      ranking_label: this.rankingLabel(input.goal, topEstCost, miles, budgetDollars),
      matched_deal: deal ? this.mapDeal(deal) : null,
      confidence,
      tags: topTags,
      source_status: sourceStatus,
    };
  }

  /**
   * Place-level source status from the extended trust taxonomy (BH6). A matched
   * deal's label wins; otherwise a curated (manual) place is `manual_curated`, a
   * Gemini budget tip / recommended order is `gemini_tip`, else `estimated`.
   */
  private deriveSourceStatus(p: FoodRunPlace, deal: Deal | null): string {
    if (deal) {
      const label = dealTrust(deal).label;
      if (label === 'verified') return 'verified';
      if (label === 'source_backed') return 'source_backed';
      if (label === 'low_confidence') return 'low_confidence';
      if (label === 'needs_verification') return 'needs_verification';
      if (label === 'mock') return 'mock';
    }
    if (p.source === 'manual') return 'manual_curated';
    if ((p.recommendedOrder ?? p.budgetTip) != null) return 'gemini_tip';
    return 'estimated';
  }

  private mapPlaceDto(
    p: FoodRunPlace,
    center: { latitude: number; longitude: number },
    estCost: number,
    hasDeal: boolean,
  ): FoodRunPlaceDto {
    return {
      id: p.id,
      name: p.name,
      category: p.categorySlug,
      price_bucket: p.priceBucket,
      rating: p.rating,
      latitude: p.latitude,
      longitude: p.longitude,
      why_recommended: p.whyRecommended,
      budget_tip: p.budgetTip,
      primary_photo_url: p.primaryPhotoUrl,
      distance_miles: Math.round(haversineMiles(center, p) * 10) / 10,
      tags: this.deriveTags(p, estCost, hasDeal),
    };
  }

  /** Human-readable tags derived from stored place fields + match state. */
  private deriveTags(p: FoodRunPlace, estCost: number, hasDeal: boolean): string[] {
    const tags: string[] = [];
    const raw = placeTags(p);
    if (estCost <= 10) tags.push('under $10');
    if ((p.studentValueScore ?? 0) >= 0.6 || p.curatedStudentFriendly)
      tags.push('good for students');
    if (hasTag(raw, ['protein', 'grill', 'meat', 'chicken', 'steak'])) tags.push('high protein');
    if (hasTag(raw, ['healthy', 'salad', 'fresh', 'wholesome'])) tags.push('healthy');
    if (p.lateNight === true || hasTag(raw, ['late', 'night', 'open_late', '24'])) {
      tags.push('late night');
    }
    if (
      p.studySpot === true ||
      hasTag(raw, ['study', 'quiet', 'wifi']) ||
      p.categorySlug === 'cafe' ||
      p.categorySlug === 'coffee'
    ) {
      tags.push('quiet study');
    }
    if ((p.rating ?? 0) >= 4.5) tags.push('highly rated');
    if (hasDeal) tags.push('has deal');
    return tags;
  }

  /** Pick the ranking label from goal + result (spec §3, the 7 labels). */
  private rankingLabel(
    goal: FoodRunGoal,
    estCost: number,
    miles: number,
    budgetDollars: number | null,
  ): string {
    const effectiveBudget = budgetDollars ?? (goal === 'under_10' ? 10 : null);
    if (effectiveBudget != null && estCost > effectiveBudget) {
      return 'Skip today if too expensive';
    }
    switch (goal) {
      case 'under_10':
        return 'Best under $10';
      case 'cheapest':
      case 'closest_cheap':
        return 'Cheapest nearby';
      case 'study_spot':
        return 'Good study spot';
      case 'late_night':
        return 'Best late-night move';
      default:
        return miles > WORTH_THE_WALK_MILES ? 'Worth the walk' : 'Best overall';
    }
  }

  private async loadPlaces(regionSlug: string | null): Promise<FoodRunPlace[]> {
    const rows = await this.prisma.place.findMany({
      where: {
        // Include enriched places AND curated/manual places (BH4) so curated
        // GSU/GT spots are Food-Run-eligible even before discovery/enrichment runs.
        OR: [{ enrichedAt: { not: null } }, { source: 'manual' }],
        ...(regionSlug ? { regionSlug } : {}),
      },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      categorySlug: r.categorySlug,
      latitude: r.latitude,
      longitude: r.longitude,
      rating: r.rating,
      priceBucket: r.priceBucket,
      affordabilityScore: r.affordabilityScore,
      cheapEatsScore: r.cheapEatsScore,
      studentValueScore: r.studentValueScore,
      hiddenGemScore: r.hiddenGemScore,
      dealLikelihoodScore: r.dealLikelihoodScore,
      bestFor: r.bestFor,
      vibeTags: r.vibeTags,
      categoryTags: r.categoryTags,
      whyRecommended: r.whyRecommended,
      budgetTip: r.budgetTip,
      primaryPhotoUrl: r.primaryPhotoUrl,
      curatedStudentFriendly: r.curatedStudentFriendly,
      source: r.source,
      lateNight: r.lateNight,
      studySpot: r.studySpot,
      chainClassification: r.chainClassification,
      estimatedMealMinMinor: r.estimatedMealMinMinor,
      estimatedMealMaxMinor: r.estimatedMealMaxMinor,
      recommendedOrder: r.recommendedOrder,
      launchRegionPriority: r.launchRegionPriority,
    }));
  }

  private async nearbyFoodDeal(place: FoodRunPlace): Promise<Deal | null> {
    const byPlace = await this.prisma.deal.findFirst({
      where: {
        placeId: place.id,
        status: 'published',
        expiresAt: { gt: new Date() },
      },
      orderBy: { dealScore: 'desc' },
    });
    if (byPlace) return byPlace;
    return this.prisma.deal.findFirst({
      where: {
        merchant: { equals: place.name, mode: 'insensitive' },
        status: 'published',
        category: { slug: 'food' },
        expiresAt: { gt: new Date() },
      },
      orderBy: { dealScore: 'desc' },
    });
  }

  private reason(goal: FoodRunGoal, miles: number): string {
    const dist = `~${miles.toFixed(1)} mi away`;
    switch (goal) {
      case 'under_10':
        return `Cheap eats under budget, ${dist}.`;
      case 'cheapest':
        return `Most affordable nearby pick, ${dist}.`;
      case 'closest_cheap':
        return `Closest affordable option, ${dist}.`;
      case 'high_protein':
        return `Solid protein-forward pick, ${dist}.`;
      case 'quick_lunch':
        return `Fast, well-rated lunch, ${dist}.`;
      case 'late_night':
        return `Good late-night option, ${dist}.`;
      case 'study_spot':
        return `Comfortable spot to study, ${dist}.`;
      case 'coffee_dessert':
        return `Good coffee/dessert stop, ${dist}.`;
      case 'date_friends':
        return `Nice spot for friends, ${dist}.`;
      case 'group_meal':
        return `Works for a group, ${dist}.`;
      case 'best_value':
        return `Best value for the rating, ${dist}.`;
      case 'pickup_deal':
        return `Likely to have a pickup deal, ${dist}.`;
      case 'student_friendly':
        return `Student-friendly value pick, ${dist}.`;
      default:
        return `Recommended nearby, ${dist}.`;
    }
  }

  private mapDeal(deal: Deal): FoodRunDto['matched_deal'] {
    return {
      merchant: deal.merchant,
      title: deal.title,
      discount:
        deal.originalPriceMinor != null &&
        deal.currentPriceMinor != null &&
        deal.originalPriceMinor > 0n
          ? `${Math.round((1 - Number(deal.currentPriceMinor) / Number(deal.originalPriceMinor)) * 100)}% off`
          : (deal.couponCode ?? null),
      price: deal.currentPriceMinor != null ? Number(deal.currentPriceMinor) / 100 : 0,
      valid_until: deal.expiresAt.toISOString(),
      source: deal.source,
      last_verified_at: deal.lastVerifiedAt ? deal.lastVerifiedAt.toISOString() : null,
      confidence: dealTrust(deal).band,
      source_url: deal.sourceUrl,
    };
  }
}
