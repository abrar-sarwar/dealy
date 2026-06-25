import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('does not sleep on the first acquire', async () => {
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      15,
      () => 0,
      async (ms) => {
        sleeps.push(ms);
      },
    );
    expect(await limiter.acquire()).toBe(0);
    expect(sleeps).toEqual([]);
  });

  it('enforces minimum spacing so calls/min <= RATE_PER_MIN', async () => {
    // 15/min => 4000ms min spacing. Mock clock advances only when we sleep.
    let nowMs = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      15,
      () => nowMs,
      async (ms) => {
        sleeps.push(ms);
        nowMs += ms; // sleeping advances the clock
      },
    );

    await limiter.acquire(); // t=0, no sleep
    await limiter.acquire(); // immediately after → must sleep 4000
    await limiter.acquire(); // again → 4000

    expect(sleeps).toEqual([4000, 4000]);
    // 3 calls spanned 8000ms → rate <= 15/min satisfied.
  });

  it('does not sleep when enough time already elapsed', async () => {
    let nowMs = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      15,
      () => nowMs,
      async (ms) => {
        sleeps.push(ms);
      },
    );
    await limiter.acquire(); // t=0
    nowMs = 5000; // more than 4000ms passed naturally
    await limiter.acquire();
    expect(sleeps).toEqual([]);
  });

  it('respects a higher configured rate (smaller spacing)', async () => {
    let nowMs = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      60,
      () => nowMs,
      async (ms) => {
        sleeps.push(ms);
        nowMs += ms;
      },
    );
    await limiter.acquire();
    await limiter.acquire();
    expect(sleeps).toEqual([1000]); // 60/min => 1000ms spacing
  });
});
