import { deriveFeedTier, feedTierRank } from './feed-tier';

const base = {
  sourceTrust: 'authoritative',
  verificationStatus: 'verified',
  moderationStatus: 'approved',
  status: 'published',
  isOnline: false,
};

describe('deriveFeedTier', () => {
  it('authoritative + verified + physical → verified', () => {
    expect(deriveFeedTier(base)).toBe('verified');
  });
  it('authoritative + verified + online → online', () => {
    expect(deriveFeedTier({ ...base, isOnline: true })).toBe('online');
  });
  it('editorial + approved + published → curated', () => {
    expect(
      deriveFeedTier({ ...base, sourceTrust: 'editorial', verificationStatus: 'pending' }),
    ).toBe('curated');
  });
  it('editorial pending moderation → community (reserved fallback)', () => {
    expect(
      deriveFeedTier({
        ...base,
        sourceTrust: 'editorial',
        verificationStatus: 'pending',
        moderationStatus: 'pending',
        status: 'draft',
      }),
    ).toBe('community');
  });
  it('unverified authoritative → community', () => {
    expect(deriveFeedTier({ ...base, verificationStatus: 'pending' })).toBe('community');
  });
});

describe('feedTierRank', () => {
  it('orders verified < curated < online < community', () => {
    expect(feedTierRank('verified')).toBe(0);
    expect(feedTierRank('curated')).toBe(1);
    expect(feedTierRank('online')).toBe(2);
    expect(feedTierRank('community')).toBe(3);
  });
});
