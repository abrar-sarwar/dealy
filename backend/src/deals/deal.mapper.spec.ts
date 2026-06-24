// src/deals/deal.mapper.spec.ts
import { mapPrismaDeal, deriveTrending } from './deal.mapper';
import type { Deal, Category } from '@prisma/client';

type FakeDeal = Omit<Deal, 'categoryId'> & { category: Pick<Category, 'slug'> };

function fakeDeal(over: Partial<FakeDeal> = {}): FakeDeal {
  return {
    id: 'd1',
    title: 't',
    merchant: 'm',
    category: { slug: 'food' },
    shortDescription: '',
    detailedDescription: '',
    terms: '',
    currentPriceMinor: 500n,
    originalPriceMinor: 1000n,
    currency: 'USD',
    dealScore: 50,
    isOnline: false,
    isStudentOnly: false,
    couponCode: null,
    destinationUrl: null,
    latitude: 33.7,
    longitude: -84.4,
    locationPrecision: 'approximate',
    locationTags: [],
    visualSeed: 0,
    verificationStatus: 'verified',
    lastVerifiedAt: new Date(),
    createdAt: new Date(),
    startAt: null,
    expiresAt: new Date(Date.now() + 1000),
    sourceTrust: 'authoritative',
    moderationStatus: 'approved',
    status: 'published',
    confidenceScore: null,
    ...over,
  } as FakeDeal;
}

describe('mapPrismaDeal trust fields', () => {
  it('authoritative verified physical → trustLevel verified', () => {
    expect(
      mapPrismaDeal(fakeDeal() as unknown as Deal & { category: Category }, null).trustLevel,
    ).toBe('verified');
  });
  it('editorial approved published → curated, carries confidenceScore', () => {
    const dto = mapPrismaDeal(
      fakeDeal({
        sourceTrust: 'editorial',
        verificationStatus: 'pending',
        confidenceScore: 77,
      }) as unknown as Deal & { category: Category },
      null,
    );
    expect(dto.trustLevel).toBe('curated');
    expect(dto.confidenceScore).toBe(77);
  });
});

describe('mapPrismaDeal redemptionBrand', () => {
  it('passes a physical-redemption brand through', () => {
    const dto = mapPrismaDeal(
      fakeDeal({ redemptionBrand: 'Apple Store' }) as unknown as Deal & { category: Category },
      null,
    );
    expect(dto.redemptionBrand).toBe('Apple Store');
  });

  it('keeps a null brand null', () => {
    const dto = mapPrismaDeal(
      fakeDeal({ redemptionBrand: null }) as unknown as Deal & { category: Category },
      null,
    );
    expect(dto.redemptionBrand).toBeNull();
  });

  it('curated student program (editorial, online, studentOnly) is curated, never verified', () => {
    const dto = mapPrismaDeal(
      fakeDeal({
        sourceTrust: 'editorial',
        verificationStatus: 'pending',
        isOnline: true,
        isStudentOnly: true,
        redemptionBrand: 'Apple Store',
      }) as unknown as Deal & { category: Category },
      null,
    );
    expect(dto.trustLevel).toBe('curated');
    expect(dto.verified).toBe(false);
  });
});

describe('deriveTrending', () => {
  const soon = new Date(Date.now() + 12 * 3600 * 1000);
  const later = new Date(Date.now() + 30 * 24 * 3600 * 1000);

  it('high-discount verified authoritative deal trends', () => {
    expect(
      deriveTrending({
        sourceTrust: 'authoritative',
        verificationStatus: 'verified',
        savingsPercentage: 55,
        expiresAt: later,
      }),
    ).toBe(true);
  });
  it('urgent verified authoritative deal trends even at low discount', () => {
    expect(
      deriveTrending({
        sourceTrust: 'authoritative',
        verificationStatus: 'verified',
        savingsPercentage: 10,
        expiresAt: soon,
      }),
    ).toBe(true);
  });
  it('unexceptional verified deal does not trend', () => {
    expect(
      deriveTrending({
        sourceTrust: 'authoritative',
        verificationStatus: 'verified',
        savingsPercentage: 10,
        expiresAt: later,
      }),
    ).toBe(false);
  });
  it('editorial/unverified never trends regardless of savings', () => {
    expect(
      deriveTrending({
        sourceTrust: 'editorial',
        verificationStatus: 'pending',
        savingsPercentage: 80,
        expiresAt: soon,
      }),
    ).toBe(false);
    expect(
      deriveTrending({
        sourceTrust: 'authoritative',
        verificationStatus: 'pending',
        savingsPercentage: 80,
        expiresAt: soon,
      }),
    ).toBe(false);
  });
});

describe('mapPrismaDeal isTrending', () => {
  function highValueVerified(over: Partial<FakeDeal> = {}) {
    return {
      id: 'd',
      title: 't',
      merchant: 'm',
      category: { slug: 'entertainment' },
      shortDescription: '',
      detailedDescription: '',
      terms: '',
      currentPriceMinor: 2000n,
      originalPriceMinor: 5000n,
      currency: 'USD', // 60% off
      dealScore: 50,
      isOnline: false,
      isStudentOnly: false,
      couponCode: null,
      destinationUrl: null,
      redemptionBrand: null,
      latitude: 34.0,
      longitude: -84.5,
      locationPrecision: 'approximate',
      locationTags: ['Kennesaw'],
      visualSeed: 0,
      verificationStatus: 'verified',
      lastVerifiedAt: new Date(),
      createdAt: new Date(),
      startAt: null,
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      sourceTrust: 'authoritative',
      moderationStatus: 'approved',
      status: 'published',
      confidenceScore: null,
      ...over,
    };
  }
  it('emits isTrending true for a high-value verified deal', () => {
    expect(
      mapPrismaDeal(highValueVerified() as unknown as Deal & { category: Category }, null)
        .isTrending,
    ).toBe(true);
  });
  it('emits isTrending false for a low-value verified deal', () => {
    const lowValue = highValueVerified({ currentPriceMinor: 4500n, originalPriceMinor: 5000n }); // 10% off
    expect(
      mapPrismaDeal(lowValue as unknown as Deal & { category: Category }, null).isTrending,
    ).toBe(false);
  });
});
