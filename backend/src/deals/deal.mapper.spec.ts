// src/deals/deal.mapper.spec.ts
import { mapPrismaDeal } from './deal.mapper';

function fakeDeal(over: Partial<any> = {}) {
  return {
    id: 'd1', title: 't', merchant: 'm',
    category: { slug: 'food' },
    shortDescription: '', detailedDescription: '', terms: '',
    currentPriceMinor: 500n, originalPriceMinor: 1000n, currency: 'USD',
    dealScore: 50, isOnline: false, isStudentOnly: false,
    couponCode: null, destinationUrl: null, latitude: 33.7, longitude: -84.4,
    locationTags: [], visualSeed: 0,
    verificationStatus: 'verified', lastVerifiedAt: new Date(), createdAt: new Date(),
    startAt: null, expiresAt: new Date(Date.now() + 1000),
    sourceTrust: 'authoritative', moderationStatus: 'approved', status: 'published',
    confidenceScore: null, ...over,
  };
}

describe('mapPrismaDeal trust fields', () => {
  it('authoritative verified physical → trustLevel verified', () => {
    expect(mapPrismaDeal(fakeDeal() as any, null).trustLevel).toBe('verified');
  });
  it('editorial approved published → curated, carries confidenceScore', () => {
    const dto = mapPrismaDeal(
      fakeDeal({ sourceTrust: 'editorial', verificationStatus: 'pending', confidenceScore: 77 }) as any,
      null,
    );
    expect(dto.trustLevel).toBe('curated');
    expect(dto.confidenceScore).toBe(77);
  });
});
