/**
 * Pure, dependency-free token-bucket rate limiter. Per-key buckets refill at a
 * steady rate up to a burst capacity; each allowed request consumes one token.
 *
 * Deliberately framework-agnostic so it is trivially unit-testable (inject a
 * fake clock) and reusable. The HTTP wiring lives in the NestJS guard.
 *
 * TODO(auth): swap for @fastify/rate-limit + Redis in multi-instance prod; gate
 * Save + per-user limits once iOS auth lands.
 */

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

/** Idle buckets older than this are pruned to bound memory in a single process. */
const PRUNE_IDLE_MS = 10 * 60 * 1000;

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly capacity: number;
  private readonly refillPerMs: number;

  /**
   * @param ratePerMin sustained tokens refilled per minute (must be > 0)
   * @param burst max tokens a key can hold (the immediate burst allowance)
   * @param now injectable clock (ms) for deterministic tests
   */
  constructor(
    ratePerMin: number,
    burst: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.capacity = Math.max(1, burst);
    this.refillPerMs = Math.max(0, ratePerMin) / 60_000;
  }

  /**
   * Attempt to consume one token for `key`. Returns true when allowed (token
   * available) and false when the bucket is empty (caller should 429).
   */
  tryConsume(key: string): boolean {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, lastRefillMs: t };
      this.buckets.set(key, b);
    } else {
      const elapsed = t - b.lastRefillMs;
      if (elapsed > 0) {
        b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerMs);
        b.lastRefillMs = t;
      }
    }

    this.prune(t);

    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Current (refilled) token count for a key — exposed for tests/inspection. */
  tokensFor(key: string): number {
    const b = this.buckets.get(key);
    if (!b) return this.capacity;
    const elapsed = this.now() - b.lastRefillMs;
    return Math.min(this.capacity, b.tokens + Math.max(0, elapsed) * this.refillPerMs);
  }

  /** Drop full, long-idle buckets so memory stays bounded in a single process. */
  private prune(t: number): void {
    if (this.buckets.size < 1024) return;
    for (const [key, b] of this.buckets) {
      if (b.tokens >= this.capacity && t - b.lastRefillMs > PRUNE_IDLE_MS) {
        this.buckets.delete(key);
      }
    }
  }
}
