import { dealFingerprint, validateNormalizedDeal, type NormalizedDeal } from './normalized-deal';

function deal(overrides: Partial<NormalizedDeal> = {}): NormalizedDeal {
  return {
    externalId: 'p-1',
    title: 'Half-Price Tacos',
    merchant: 'Taqueria',
    categorySlug: 'food',
    shortDescription: 's',
    detailedDescription: 'd',
    terms: 't',
    currentPriceMinor: 450n,
    originalPriceMinor: 900n,
    currency: 'USD',
    isOnline: false,
    isStudentOnly: false,
    couponCode: null,
    destinationUrl: null,
    latitude: 33.75,
    longitude: -84.39,
    locationTags: ['atlanta'],
    dealScore: 70,
    visualSeed: 1,
    startAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  };
}

describe('dealFingerprint', () => {
  it('is deterministic for equivalent deals (even with different externalId)', () => {
    expect(dealFingerprint(deal({ externalId: 'a' }))).toBe(
      dealFingerprint(deal({ externalId: 'b' })),
    );
  });

  it('differs when merchant, title, price, or category differ', () => {
    const base = dealFingerprint(deal());
    expect(dealFingerprint(deal({ merchant: 'Other' }))).not.toBe(base);
    expect(dealFingerprint(deal({ title: 'Different' }))).not.toBe(base);
    expect(dealFingerprint(deal({ currentPriceMinor: 999n }))).not.toBe(base);
    expect(dealFingerprint(deal({ categorySlug: 'tech' }))).not.toBe(base);
  });
});

describe('validateNormalizedDeal', () => {
  it('accepts a valid deal', () => {
    expect(() => validateNormalizedDeal(deal())).not.toThrow();
  });

  it('rejects expired, missing-field, and negative-price deals', () => {
    expect(() => validateNormalizedDeal(deal({ expiresAt: new Date(Date.now() - 1000) }))).toThrow(
      /expired/,
    );
    expect(() => validateNormalizedDeal(deal({ title: '  ' }))).toThrow(/title/);
    expect(() => validateNormalizedDeal(deal({ merchant: '' }))).toThrow(/merchant/);
    expect(() => validateNormalizedDeal(deal({ currentPriceMinor: -5n }))).toThrow(/negative/);
  });
});
