import { confidenceScore, type DealCandidate } from './deal-candidate';

function candidate(over: Partial<DealCandidate> = {}): DealCandidate {
  return {
    title: 'Happy Hour', merchant: 'The Pub', categorySlug: 'food',
    address: '123 Peachtree St, Atlanta, GA', latitude: 33.75, longitude: -84.39,
    startAt: new Date(Date.now() + 1000), expiresAt: new Date(Date.now() + 86_400_000),
    sourceUrl: 'https://pub.test/specials', currentPriceMinor: 500n,
    couponCode: null, isStudentOnly: false,
    extractionPath: 'structured', geocodeConfidence: 0.9, ...over,
  };
}

describe('confidenceScore', () => {
  it('full structured candidate scores high', () => {
    expect(confidenceScore(candidate())).toBeGreaterThanOrEqual(85);
  });
  it('llm path scores below an equivalent structured one', () => {
    expect(confidenceScore(candidate({ extractionPath: 'llm' })))
      .toBeLessThan(confidenceScore(candidate()));
  });
  it('missing fields lower the score', () => {
    expect(confidenceScore(candidate({ merchant: '', address: '' })))
      .toBeLessThan(confidenceScore(candidate()));
  });
  it('clamps to 0–100', () => {
    const s = confidenceScore(candidate({ geocodeConfidence: 0 }));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
