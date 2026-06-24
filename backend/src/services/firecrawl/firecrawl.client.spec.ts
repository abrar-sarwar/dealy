import { FirecrawlClient } from './firecrawl.client';

describe('FirecrawlClient', () => {
  it('sends scrape requests with timeout and bearer auth', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { markdown: 'deal text', url: 'https://x.test' } }),
    });
    const client = new FirecrawlClient({
      apiKey: 'fc-key',
      timeoutMs: 1000,
      maxRetries: 0,
      minTimeBetweenRequestsMs: 0,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.scrape({ url: 'https://x.test' })).resolves.toMatchObject({
      markdown: 'deal text',
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.firecrawl.dev/v2/scrape',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer fc-key' }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('retries transient failures', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { markdown: 'ok' } }),
      });
    const client = new FirecrawlClient({
      apiKey: 'fc-key',
      timeoutMs: 1000,
      maxRetries: 1,
      minTimeBetweenRequestsMs: 0,
      retryDelayMs: 1,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.scrape({ url: 'https://x.test' })).resolves.toMatchObject({
      markdown: 'ok',
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
