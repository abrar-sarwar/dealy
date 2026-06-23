export const MAX_BYTES = 2_000_000;

/** Polite single-page fetch: descriptive UA, timeout, and a hard size cap. */
export class SourceFetcher {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async fetchPage(url: string): Promise<string> {
    const res = await this.fetchFn(url, {
      headers: { 'User-Agent': 'DealyCrawler/1.0 (+https://dealy.app/crawler)' },
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
