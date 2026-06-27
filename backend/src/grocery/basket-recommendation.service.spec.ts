import {
  BasketRecommendationService,
  SCORE_WEIGHTS,
  SECOND_STOP_PENALTY,
  LOW_CONFIDENCE_PENALTY,
  COMBO_SAVINGS_THRESHOLD_FRACTION,
} from './basket-recommendation.service';
import type { BasketLineItem, CandidateStore, RankOptions } from './grocery.types';

/** Build a basket line with a baseline line-total estimate. */
function item(slug: string, estimatedPriceMinor: number): BasketLineItem {
  return {
    slug,
    name: slug,
    category: 'protein',
    unit: 'each',
    quantity: 1,
    estimatedPriceMinor,
    substitutionOptions: [],
  };
}

/** Build a store that stocks the given slugs at the given prices. */
function store(
  name: string,
  distanceMiles: number | null,
  offers: Array<{ slug: string; priceMinor: number; dealConfidence?: number; matched?: boolean }>,
): CandidateStore {
  return {
    name,
    placeId: null,
    kind: 'known',
    distanceMiles,
    offers: offers.map((o) => ({
      slug: o.slug,
      priceMinor: o.priceMinor,
      dealConfidence: o.dealConfidence ?? 0,
      matchedDealId: o.matched ? `deal-${o.slug}` : null,
    })),
  };
}

const OPTS: RankOptions = { budgetMinor: 3500, maxDistanceMiles: 10, allowSecondStop: true };

describe('BasketRecommendationService', () => {
  const svc = new BasketRecommendationService();

  it('exposes named score weights that sum to 1', () => {
    const sum =
      SCORE_WEIGHTS.match +
      SCORE_WEIGHTS.savings +
      SCORE_WEIGHTS.confidence +
      SCORE_WEIGHTS.distance +
      SCORE_WEIGHTS.budget;
    expect(sum).toBeCloseTo(1, 5);
    expect(SECOND_STOP_PENALTY).toBeGreaterThan(0);
    expect(LOW_CONFIDENCE_PENALTY).toBeGreaterThan(0);
    expect(COMBO_SAVINGS_THRESHOLD_FRACTION).toBeGreaterThan(0);
  });

  it('picks the best single store by score (full coverage + cheaper + verified deals + closer)', () => {
    const items = [item('eggs', 300), item('rice', 600), item('milk', 400)];
    const aldi = store('Aldi', 1.2, [
      { slug: 'eggs', priceMinor: 249, dealConfidence: 0.9, matched: true },
      { slug: 'rice', priceMinor: 549 },
      { slug: 'milk', priceMinor: 379 },
    ]);
    // A pricier, farther store with no deals.
    const publix = store('Publix', 6.5, [
      { slug: 'eggs', priceMinor: 349 },
      { slug: 'rice', priceMinor: 699 },
      { slug: 'milk', priceMinor: 459 },
    ]);

    const result = svc.rankStores(items, [aldi, publix], OPTS);
    expect(result.bestStore?.store.name).toBe('Aldi');
    expect(result.bestStore?.itemMatchRate).toBeCloseTo(1, 5);
    expect(result.missingItems).toEqual([]);
  });

  it('adds a second stop only when combo savings exceed the travel-cost threshold', () => {
    const items = [item('eggs', 300), item('rice', 600), item('steak', 1500)];
    // Best store covers everything at estimate.
    const best = store('Aldi', 1.0, [
      { slug: 'eggs', priceMinor: 280 },
      { slug: 'rice', priceMinor: 560 },
      { slug: 'steak', priceMinor: 1500 },
    ]);
    // A second store with a HUGE verified discount on steak (big combo savings).
    const butcher = store('Butcher', 2.0, [
      { slug: 'steak', priceMinor: 700, dealConfidence: 0.95, matched: true },
    ]);
    const withSavings = svc.rankStores(items, [best, butcher], OPTS);
    expect(withSavings.bestStore?.store.name).toBe('Aldi');
    expect(withSavings.secondStop?.store.name).toBe('Butcher');

    // Now the second store offers only a trivial saving — not worth a second trip.
    const sameish = store('Corner', 2.0, [{ slug: 'steak', priceMinor: 1480 }]);
    const noSecond = svc.rankStores(items, [best, sameish], OPTS);
    expect(noSecond.secondStop).toBeNull();
  });

  it('respects allowSecondStop=false', () => {
    const items = [item('eggs', 300), item('steak', 1500)];
    const best = store('Aldi', 1.0, [{ slug: 'eggs', priceMinor: 280 }]);
    const butcher = store('Butcher', 2.0, [
      { slug: 'steak', priceMinor: 700, dealConfidence: 0.95, matched: true },
    ]);
    const result = svc.rankStores(items, [best, butcher], {
      ...OPTS,
      allowSecondStop: false,
    });
    expect(result.secondStop).toBeNull();
  });

  it('reports low confidence when the best store covers little of the basket', () => {
    const items = [item('a', 200), item('b', 200), item('c', 200), item('d', 200), item('e', 200)];
    const thin = store('Corner', 0.5, [{ slug: 'a', priceMinor: 200 }]); // 1/5 coverage
    const result = svc.rankStores(items, [thin], OPTS);
    expect(result.confidence).toBe('low');
    expect(result.missingItems).toEqual(expect.arrayContaining(['b', 'c', 'd', 'e']));
  });

  it('returns no store and low confidence when out of area (no candidate stores)', () => {
    const items = [item('eggs', 300), item('rice', 600)];
    const result = svc.rankStores(items, [], OPTS);
    expect(result.bestStore).toBeNull();
    expect(result.secondStop).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.missingItems).toEqual(['eggs', 'rice']);
  });

  it('reports high confidence with full coverage and verified deals', () => {
    const items = [item('eggs', 300), item('rice', 600)];
    const aldi = store('Aldi', 1.0, [
      { slug: 'eggs', priceMinor: 240, dealConfidence: 0.9, matched: true },
      { slug: 'rice', priceMinor: 500, dealConfidence: 0.85, matched: true },
    ]);
    const result = svc.rankStores(items, [aldi], OPTS);
    expect(result.confidence).toBe('high');
  });
});
