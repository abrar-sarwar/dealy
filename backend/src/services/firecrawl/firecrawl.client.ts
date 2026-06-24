import {
  FirecrawlError,
  type FirecrawlCrawlRequest,
  type FirecrawlDocument,
  type FirecrawlExtractRequest,
  type FirecrawlScrapeRequest,
} from './firecrawl.types';

export interface FirecrawlClientOptions {
  apiKey?: string;
  apiUrl?: string;
  timeoutMs: number;
  maxRetries?: number;
  retryDelayMs?: number;
  minTimeBetweenRequestsMs?: number;
  fetchFn?: typeof fetch;
}

export class FirecrawlClient {
  private readonly apiUrl: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly minTimeBetweenRequestsMs: number;
  private readonly fetchFn: typeof fetch;
  private lastRequestAt = 0;

  constructor(private readonly opts: FirecrawlClientOptions) {
    this.apiUrl = (opts.apiUrl ?? 'https://api.firecrawl.dev').replace(/\/$/, '');
    this.maxRetries = opts.maxRetries ?? 2;
    this.retryDelayMs = opts.retryDelayMs ?? 250;
    this.minTimeBetweenRequestsMs = opts.minTimeBetweenRequestsMs ?? 200;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async scrape(request: FirecrawlScrapeRequest): Promise<FirecrawlDocument> {
    const body = { formats: ['markdown'], onlyMainContent: true, ...request };
    const json = await this.post<{ data?: FirecrawlDocument }>('/v2/scrape', body);
    return json.data ?? (json as FirecrawlDocument);
  }

  async crawl(request: FirecrawlCrawlRequest): Promise<unknown> {
    return this.post('/v2/crawl', request);
  }

  async extract(request: FirecrawlExtractRequest): Promise<unknown> {
    return this.post('/v2/extract', request);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.opts.apiKey) throw new FirecrawlError('FIRECRAWL_API_KEY is not configured');
    let last: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.waitForRateLimit();
        const res = await this.fetchFn(`${this.apiUrl}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.opts.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        if (!res.ok) {
          const message = await res.text().catch(() => '');
          throw new FirecrawlError(
            `Firecrawl ${path} failed: ${res.status} ${message}`.trim(),
            res.status,
            res.status >= 500 || res.status === 429,
          );
        }
        return (await res.json()) as T;
      } catch (err) {
        last = err;
        const retryable = err instanceof FirecrawlError ? err.retryable : true;
        if (!retryable || attempt >= this.maxRetries) break;
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * (attempt + 1)));
      }
    }
    throw last instanceof Error ? last : new FirecrawlError('Firecrawl request failed');
  }

  private async waitForRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minTimeBetweenRequestsMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minTimeBetweenRequestsMs - elapsed));
    }
    this.lastRequestAt = Date.now();
  }
}
