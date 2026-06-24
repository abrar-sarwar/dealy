import { SourceFetcher } from './source-fetcher';

describe('SourceFetcher', () => {
  it('returns the body on 200', async () => {
    const fetchFn = (async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-length', '20']]),
      text: async () => '<html>ok</html>',
    })) as unknown as typeof fetch;
    expect(await new SourceFetcher(fetchFn).fetchPage('https://x.test')).toContain('ok');
  });
  it('throws on a non-OK status', async () => {
    const fetchFn = (async () => ({
      ok: false,
      status: 503,
      headers: new Map(),
      text: async () => '',
    })) as unknown as typeof fetch;
    await expect(new SourceFetcher(fetchFn).fetchPage('https://x.test')).rejects.toThrow('503');
  });
  it('throws when the body exceeds the size cap', async () => {
    const fetchFn = (async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(5_000_000)]]),
      text: async () => '',
    })) as unknown as typeof fetch;
    await expect(new SourceFetcher(fetchFn).fetchPage('https://x.test')).rejects.toThrow(
      /too large/i,
    );
  });
});
