/** Simple paced limiter: enforces at most `ratePerMin` acquisitions per rolling
 *  minute by sleeping before a call when the minimum spacing has not elapsed.
 *  Clock + sleep are injectable so tests can run deterministically with no real
 *  delay. With ratePerMin=15 the minimum spacing is 4000ms. */
export class RateLimiter {
  private readonly minIntervalMs: number;
  private lastAt: number | null = null;

  constructor(
    ratePerMin: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {
    const rate = ratePerMin > 0 ? ratePerMin : 1;
    this.minIntervalMs = Math.ceil(60_000 / rate);
  }

  /** Wait (if needed) so the time since the previous acquire is >= minIntervalMs,
   *  then mark this acquisition. Returns the ms slept (0 for the first call). */
  async acquire(): Promise<number> {
    const t = this.now();
    if (this.lastAt == null) {
      this.lastAt = t;
      return 0;
    }
    const elapsed = t - this.lastAt;
    const wait = this.minIntervalMs - elapsed;
    if (wait > 0) {
      await this.sleep(wait);
      this.lastAt = this.now();
      return wait;
    }
    this.lastAt = t;
    return 0;
  }
}
