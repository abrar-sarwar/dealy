import { computeQualityScore, type QualityScoreInput } from './deal-quality';

const base: QualityScoreInput = {
  concreteOfferScore: 1,
  areaRelevance: 1,
  isVague: false,
  categorySlug: 'food',
  campusDealType: 'dining',
  locationPrecision: 'exact',
  hasImage: true,
  reliabilityScore: 90,
};

describe('computeQualityScore', () => {
  it('scores a concrete food restaurant discount HIGH', () => {
    expect(computeQualityScore(base)).toBeGreaterThanOrEqual(85);
  });

  it('scores a vague "Special Offer"/"Gift Card" LOW', () => {
    const score = computeQualityScore({
      ...base,
      concreteOfferScore: 0,
      areaRelevance: 0.2,
      isVague: true,
      categorySlug: 'services',
      campusDealType: 'other',
      locationPrecision: 'approximate',
      hasImage: false,
      reliabilityScore: 50,
    });
    expect(score).toBeLessThan(15);
  });

  it('ranks the concrete offer well above the vague one', () => {
    const high = computeQualityScore(base);
    const low = computeQualityScore({
      ...base,
      concreteOfferScore: 0,
      isVague: true,
    });
    expect(high).toBeGreaterThan(low + 40);
  });

  it('is dominated by concreteness — a non-concrete but relevant offer scores modestly', () => {
    const score = computeQualityScore({
      ...base,
      concreteOfferScore: 0,
      isVague: false,
    });
    // area relevance + category + locality + image + reliability, no concreteness.
    expect(score).toBeLessThan(50);
    expect(score).toBeGreaterThan(0);
  });

  it('clamps to 0..100', () => {
    expect(computeQualityScore({ ...base, reliabilityScore: 1000 })).toBeLessThanOrEqual(100);
    expect(
      computeQualityScore({ ...base, concreteOfferScore: 0, areaRelevance: 0, isVague: true }),
    ).toBeGreaterThanOrEqual(0);
  });

  it('rewards exact location and a real image over approximate/no-image', () => {
    const withLoc = computeQualityScore(base);
    const without = computeQualityScore({
      ...base,
      locationPrecision: 'approximate',
      hasImage: false,
    });
    expect(withLoc).toBeGreaterThan(without);
  });
});
