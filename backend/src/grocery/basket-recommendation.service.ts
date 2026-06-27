import { Injectable } from '@nestjs/common';
import type {
  BasketLineItem,
  CandidateStore,
  Confidence,
  RankOptions,
  RecommendationResult,
  StoreOffer,
  StoreScore,
} from './grocery.types';

/**
 * Named weights for the store score (spec §4). They sum to 1 so the base score
 * lands in [0,1] before penalties:
 *
 *   score = itemMatchRate     * w.match
 *         + estimatedSavings  * w.savings
 *         + dealConfidence    * w.confidence
 *         + storeDistanceScore* w.distance
 *         + budgetFitScore    * w.budget
 *         - secondStopPenalty       (0 for the best single store)
 *         - lowConfidencePenalty    (when coverage is thin)
 */
export const SCORE_WEIGHTS = {
  match: 0.35,
  savings: 0.25,
  confidence: 0.15,
  distance: 0.15,
  budget: 0.1,
} as const;

/** Fixed score cost of asking the student to make a second trip. */
export const SECOND_STOP_PENALTY = 0.15;

/** Score cost applied to a store that covers less than LOW_COVERAGE_THRESHOLD. */
export const LOW_CONFIDENCE_PENALTY = 0.1;

/** Coverage below this fraction is "thin" (penalised + caps confidence at low). */
export const LOW_COVERAGE_THRESHOLD = 0.6;

/** A second store is only worth it when its extra savings exceed this fraction
 *  of the budget (a proxy for travel cost / hassle). */
export const COMBO_SAVINGS_THRESHOLD_FRACTION = 0.08;

/** Confidence promotion thresholds. */
const HIGH_COVERAGE_THRESHOLD = 0.9;
const HIGH_DEAL_CONFIDENCE_THRESHOLD = 0.5;

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Distance term in [0,1]: 1 at the door, 0 at/after maxDistance. Null → neutral. */
function distanceScore(distanceMiles: number | null, maxDistanceMiles: number): number {
  if (distanceMiles == null) return 0.5;
  if (maxDistanceMiles <= 0) return 0;
  return clamp01(1 - distanceMiles / maxDistanceMiles);
}

/** Budget-fit term in [0,1]: 1 when under budget, decaying as the total overflows. */
function budgetFitScore(totalMinor: number, budgetMinor: number): number {
  if (budgetMinor <= 0) return 0;
  if (totalMinor <= budgetMinor) return 1;
  return clamp01(budgetMinor / totalMinor);
}

/** The pure ranking brain for Smart Basket. No I/O — fully unit tested. */
@Injectable()
export class BasketRecommendationService {
  /**
   * Score one store against the basket. The store only covers items it stocks
   * (its `offers`); uncovered items neither cost nor save here. Savings are
   * measured against the basket's baseline estimate for the covered items.
   */
  scoreStore(items: BasketLineItem[], store: CandidateStore, opts: RankOptions): StoreScore {
    const offerBySlug = new Map<string, StoreOffer>(store.offers.map((o) => [o.slug, o]));
    const coveredSlugs: string[] = [];
    let estimatedTotalMinor = 0;
    let baselineMinor = 0;
    const dealConfidences: number[] = [];

    for (const it of items) {
      const offer = offerBySlug.get(it.slug);
      if (!offer) continue;
      coveredSlugs.push(it.slug);
      estimatedTotalMinor += offer.priceMinor;
      baselineMinor += it.estimatedPriceMinor;
      if (offer.matchedDealId) dealConfidences.push(offer.dealConfidence);
    }

    const itemMatchRate = items.length > 0 ? coveredSlugs.length / items.length : 0;
    const estimatedSavingsMinor = Math.max(0, baselineMinor - estimatedTotalMinor);
    const savingsTerm = baselineMinor > 0 ? clamp01(estimatedSavingsMinor / baselineMinor) : 0;
    const dealConfidence =
      dealConfidences.length > 0
        ? dealConfidences.reduce((a, b) => a + b, 0) / dealConfidences.length
        : 0;

    const base =
      itemMatchRate * SCORE_WEIGHTS.match +
      savingsTerm * SCORE_WEIGHTS.savings +
      dealConfidence * SCORE_WEIGHTS.confidence +
      distanceScore(store.distanceMiles, opts.maxDistanceMiles) * SCORE_WEIGHTS.distance +
      budgetFitScore(estimatedTotalMinor, opts.budgetMinor) * SCORE_WEIGHTS.budget;

    const lowConfidencePenalty = itemMatchRate < LOW_COVERAGE_THRESHOLD ? LOW_CONFIDENCE_PENALTY : 0;

    return {
      store,
      score: base - lowConfidencePenalty,
      itemMatchRate,
      coveredSlugs,
      estimatedTotalMinor,
      estimatedSavingsMinor,
      dealConfidence,
      distanceMiles: store.distanceMiles,
    };
  }

  /**
   * Rank candidate stores, pick the best single store, and (optionally) a second
   * stop when the extra savings justify the trip. Pure + deterministic.
   */
  rankStores(
    items: BasketLineItem[],
    stores: CandidateStore[],
    opts: RankOptions,
  ): RecommendationResult {
    if (stores.length === 0 || items.length === 0) {
      return {
        bestStore: null,
        secondStop: null,
        confidence: 'low',
        missingItems: items.map((i) => i.slug),
        routeSummary: 'No stores nearby — try widening your search.',
      };
    }

    const scored = stores
      .map((s) => this.scoreStore(items, s, opts))
      .sort((a, b) => b.score - a.score || a.estimatedTotalMinor - b.estimatedTotalMinor);

    const best = scored[0];
    const bestCovered = new Set(best.coveredSlugs);

    const secondStop = opts.allowSecondStop ? this.pickSecondStop(items, best, scored, opts) : null;

    const covered = new Set(best.coveredSlugs);
    if (secondStop) for (const s of secondStop.coveredSlugs) covered.add(s);
    const missingItems = items.filter((i) => !covered.has(i.slug)).map((i) => i.slug);

    return {
      bestStore: best,
      secondStop,
      confidence: this.deriveConfidence(best),
      missingItems,
      routeSummary: this.routeSummary(best, secondStop),
    };
  }

  /**
   * Find the store that adds the most incremental savings over the best store —
   * covering items the best store misses, or beating its price on shared items.
   * Returns it only when that combo saving clears the travel-cost threshold.
   */
  private pickSecondStop(
    items: BasketLineItem[],
    best: StoreScore,
    scored: StoreScore[],
    opts: RankOptions,
  ): StoreScore | null {
    const threshold = Math.round(opts.budgetMinor * COMBO_SAVINGS_THRESHOLD_FRACTION);
    const bestOffers = new Map<string, StoreOffer>(best.store.offers.map((o) => [o.slug, o]));
    const itemBySlug = new Map(items.map((i) => [i.slug, i]));

    let winner: { score: StoreScore; comboSavings: number; total: number } | null = null;
    for (const cand of scored) {
      if (cand.store === best.store) continue;
      if (cand.distanceMiles != null && cand.distanceMiles > opts.maxDistanceMiles) continue;

      let comboSavings = 0;
      let incrementalTotal = 0;
      for (const offer of cand.store.offers) {
        const line = itemBySlug.get(offer.slug);
        if (!line) continue;
        const bestOffer = bestOffers.get(offer.slug);
        // The price the user would otherwise pay: best store's price, or the
        // basket estimate if the best store doesn't stock it.
        const fallback = bestOffer ? bestOffer.priceMinor : line.estimatedPriceMinor;
        const delta = fallback - offer.priceMinor;
        if (delta > 0) {
          comboSavings += delta;
          incrementalTotal += offer.priceMinor;
        }
      }
      if (comboSavings > threshold && (!winner || comboSavings > winner.comboSavings)) {
        winner = { score: cand, comboSavings, total: incrementalTotal };
      }
    }

    if (!winner) return null;
    // Report the second store with its INCREMENTAL contribution (the reason it's
    // worth a separate trip), not its full standalone basket.
    return {
      ...winner.score,
      estimatedTotalMinor: winner.total,
      estimatedSavingsMinor: winner.comboSavings,
    };
  }

  private deriveConfidence(best: StoreScore): Confidence {
    if (best.itemMatchRate >= HIGH_COVERAGE_THRESHOLD && best.dealConfidence >= HIGH_DEAL_CONFIDENCE_THRESHOLD) {
      return 'high';
    }
    if (best.itemMatchRate >= LOW_COVERAGE_THRESHOLD) return 'medium';
    return 'low';
  }

  private routeSummary(best: StoreScore, second: StoreScore | null): string {
    const miles = (m: number | null): string => (m == null ? '' : ` · ~${m.toFixed(1)} mi`);
    if (!second) return `1 stop · ${best.store.name}${miles(best.distanceMiles)}`;
    const totalMiles =
      best.distanceMiles != null && second.distanceMiles != null
        ? best.distanceMiles + second.distanceMiles
        : null;
    return `2 stops · ${best.store.name} + ${second.store.name}${miles(totalMiles)}`;
  }
}
