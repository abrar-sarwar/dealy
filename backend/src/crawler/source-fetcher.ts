import { Logger } from '@nestjs/common';
import { RobotsChecker } from './robots-checker';

export const MAX_BYTES = 2_000_000;
const USER_AGENT = 'DealyCrawler/1.0 (+https://dealy.app/crawler)';

/** Polite single-page fetch: descriptive UA, timeout, and a hard size cap. When a
 *  RobotsChecker is supplied and robots are respected, it gates the fetch:
 *  fail-CLOSED (throws → caller records a failure) on an explicit Disallow,
 *  fail-OPEN-with-warning when robots.txt is unreachable. */
export class SourceFetcher {
  private readonly logger = new Logger(SourceFetcher.name);

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly robots?: RobotsChecker,
    private readonly respectRobots: boolean = false,
  ) {}

  async fetchPage(url: string): Promise<string> {
    if (this.respectRobots && this.robots) {
      const verdict = await this.robots.isAllowed(url);
      if (verdict === 'disallowed') {
        // Fail CLOSED: skip + record a failure (the crawler run catches this).
        throw new Error(`robots.txt disallows crawling ${url}`);
      }
      if (verdict === 'unreachable') {
        // Fail OPEN with a warning (the checker already logged the cause).
        this.logger.warn(`robots.txt unreachable for ${url}; proceeding (fail-open)`);
      }
    }

    const res = await this.fetchFn(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const len = Number(res.headers.get('content-length') ?? '0');
    if (len > MAX_BYTES) throw new Error(`response too large (${len} bytes)`);
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new Error(`response too large (${body.length} bytes)`);
    return body;
  }
}
