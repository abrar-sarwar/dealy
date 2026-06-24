import { aiCacheKey, contentHash, shouldTriggerDiscovery } from './discovery-cost';
import { rankDealCandidate } from './ranking';

describe('contentHash', () => {
  it('normalizes whitespace before hashing content', () => {
    expect(contentHash('Students get 20% off')).toBe(contentHash(' Students   get 20%   off '));
  });
});

describe('aiCacheKey', () => {
  it('includes task, model, schema version, and normalized prompt content', () => {
    const a = aiCacheKey({
      task: 'deal_extraction',
      model: 'gemini-2.5-flash',
      schemaVersion: 'v1',
      prompt: 'Students get 20% off',
    });
    const b = aiCacheKey({
      task: 'deal_extraction',
      model: 'gemini-2.5-flash',
      schemaVersion: 'v1',
      prompt: ' Students   get 20%   off ',
    });
    expect(a).toBe(b);
  });
});

describe('shouldTriggerDiscovery', () => {
  const now = new Date('2026-06-24T12:00:00Z');

  it('does not trigger when crawler is disabled', () => {
    expect(
      shouldTriggerDiscovery({
        enabled: false,
        dealCount: 0,
        minLocalDeals: 25,
        lastRefresh: null,
        refreshHours: 12,
        now,
      }),
    ).toEqual({ trigger: false, reason: 'crawler_disabled' });
  });

  it('triggers when inventory has too few deals', () => {
    expect(
      shouldTriggerDiscovery({
        enabled: true,
        dealCount: 24,
        minLocalDeals: 25,
        lastRefresh: now,
        refreshHours: 12,
        now,
      }),
    ).toEqual({ trigger: true, reason: 'below_minimum_deals' });
  });

  it('triggers when inventory is stale', () => {
    expect(
      shouldTriggerDiscovery({
        enabled: true,
        dealCount: 30,
        minLocalDeals: 25,
        lastRefresh: new Date('2026-06-23T20:00:00Z'),
        refreshHours: 12,
        now,
      }),
    ).toEqual({ trigger: true, reason: 'inventory_stale' });
  });
});

describe('rankDealCandidate', () => {
  it('combines normalized ranking signals into a 0-100 score', () => {
    expect(
      rankDealCandidate({
        distanceScore: 0.8,
        discountScore: 0.7,
        freshnessScore: 0.9,
        verificationScore: 1,
        popularityScore: 0.4,
        confidenceScore: 0.95,
      }),
    ).toBe(82);
  });
});
