import { toBasketDto } from './grocery.mapper';
import type { BasketEntity } from './grocery-basket.service';

/** Build a minimal persisted-basket entity for the wire mapper. */
function entity(over: Partial<BasketEntity> = {}): BasketEntity {
  const base = {
    id: 'b1',
    userId: null,
    title: '$35 Cheapest Grocery Run',
    goal: 'cheapest',
    budgetMinor: 3500,
    timeframe: '1_week',
    latitude: 33.75,
    longitude: -84.39,
    regionSlug: 'gsu',
    campusSlug: null,
    estimatedTotalMinor: 3000,
    estimatedSavingsMinor: 500,
    confidence: 'medium',
    explanation: 'Kroger covers most of your basket.',
    sourceStatus: 'source_backed',
    routeSummary: '1 stop · Kroger',
    dietaryPrefs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'i1',
        basketId: 'b1',
        name: 'Eggs',
        stapleSlug: 'eggs',
        category: 'dairy',
        estimatedPriceMinor: 300,
        quantity: 1,
        unit: 'dozen',
        storeName: 'Kroger',
        matchedDealId: 'd1',
        confidence: 'high',
        trustLabel: 'verified',
        substitutions: ['Egg whites'],
        createdAt: new Date(),
        dealMatch: null,
      },
    ],
    storeRecs: [
      {
        id: 's1',
        basketId: 'b1',
        storeName: 'Kroger',
        placeId: 'p1',
        kind: 'best_single',
        score: 0.8,
        estimatedTotalMinor: 3000,
        estimatedSavingsMinor: 500,
        distanceMiles: 1.234,
        latitude: 33.7601,
        longitude: -84.3902,
        reason: 'Covers 90% of your basket under budget',
        createdAt: new Date(),
      },
      {
        id: 's2',
        basketId: 'b1',
        storeName: 'Aldi',
        placeId: null,
        kind: 'second_stop',
        score: 0.5,
        estimatedTotalMinor: 800,
        estimatedSavingsMinor: 200,
        distanceMiles: null,
        latitude: null,
        longitude: null,
        reason: 'Worth a stop to save $2.00',
        createdAt: new Date(),
      },
    ],
  };
  return { ...base, ...over } as unknown as BasketEntity;
}

describe('toBasketDto (BH6/BH8)', () => {
  it('passes through the item trust label and surfaces store coordinates', () => {
    const dto = toBasketDto(entity());
    expect(dto.items[0].trust_label).toBe('verified');
    expect(dto.best_store?.latitude).toBe(33.7601);
    expect(dto.best_store?.longitude).toBe(-84.3902);
    expect(dto.best_store?.distance_miles).toBe(1.2);
  });

  it('emits null coordinates for the known-store fallback (no Place/Deal)', () => {
    const dto = toBasketDto(entity());
    expect(dto.optional_second_store?.latitude).toBeNull();
    expect(dto.optional_second_store?.longitude).toBeNull();
  });

  it('carries the basket source status through', () => {
    const dto = toBasketDto(entity({ sourceStatus: 'estimated' } as Partial<BasketEntity>));
    expect(dto.source_status).toBe('estimated');
  });
});
