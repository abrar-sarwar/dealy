import { TokenBucketLimiter } from './token-bucket';

describe('TokenBucketLimiter', () => {
  it('allows up to the burst capacity immediately, then blocks', () => {
    const now = 1_000;
    const limiter = new TokenBucketLimiter(20, 5, () => now);
    const results = Array.from({ length: 6 }, () => limiter.tryConsume('ip-a'));
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it('refills tokens over time at the configured rate', () => {
    let now = 0;
    // 60/min => 1 token per second.
    const limiter = new TokenBucketLimiter(60, 1, () => now);
    expect(limiter.tryConsume('k')).toBe(true); // consume the single token
    expect(limiter.tryConsume('k')).toBe(false); // empty
    now += 1_000; // one second → one token refilled
    expect(limiter.tryConsume('k')).toBe(true);
  });

  it('never refills beyond the burst capacity', () => {
    let now = 0;
    const limiter = new TokenBucketLimiter(60, 3, () => now);
    now += 60_000; // a full minute of idle
    expect(limiter.tokensFor('k')).toBe(3);
  });

  it('tracks buckets independently per key', () => {
    const now = 0;
    const limiter = new TokenBucketLimiter(20, 1, () => now);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
    expect(limiter.tryConsume('b')).toBe(true); // b has its own bucket
  });

  it('treats a zero rate as a fixed burst budget that never refills', () => {
    let now = 0;
    const limiter = new TokenBucketLimiter(0, 2, () => now);
    expect(limiter.tryConsume('k')).toBe(true);
    expect(limiter.tryConsume('k')).toBe(true);
    expect(limiter.tryConsume('k')).toBe(false);
    now += 600_000;
    expect(limiter.tryConsume('k')).toBe(false);
  });
});
