import { RobotsChecker, parseRobots } from './robots-checker';

/** Build a fake fetch returning the given robots.txt body (or a status error). */
function fakeFetch(opts: {
  body?: string;
  status?: number;
  throws?: boolean;
}): typeof fetch {
  return (async () => {
    if (opts.throws) throw new Error('network down');
    const status = opts.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => opts.body ?? '',
    };
  }) as unknown as typeof fetch;
}

describe('parseRobots', () => {
  it('groups directives by user-agent, sharing blocks across consecutive agents', () => {
    const groups = parseRobots(
      ['User-agent: *', 'Disallow: /private', 'Allow: /private/ok', '', 'User-agent: BadBot', 'User-agent: DealyCrawler', 'Disallow: /'].join(
        '\n',
      ),
    );
    expect(groups.get('*')?.disallow).toEqual(['/private']);
    expect(groups.get('*')?.allow).toEqual(['/private/ok']);
    expect(groups.get('dealycrawler')?.disallow).toEqual(['/']);
    expect(groups.get('badbot')?.disallow).toEqual(['/']);
  });
});

describe('RobotsChecker', () => {
  it('allows a path not covered by any Disallow', async () => {
    const checker = new RobotsChecker('DealyCrawler', fakeFetch({ body: 'User-agent: *\nDisallow: /admin' }));
    expect(await checker.isAllowed('https://shop.test/deals')).toBe('allowed');
  });

  it('disallows a path explicitly blocked for the wildcard agent', async () => {
    const checker = new RobotsChecker('DealyCrawler', fakeFetch({ body: 'User-agent: *\nDisallow: /admin' }));
    expect(await checker.isAllowed('https://shop.test/admin/users')).toBe('disallowed');
  });

  it('honours a UA-specific block over the wildcard group', async () => {
    const body = ['User-agent: *', 'Disallow:', '', 'User-agent: DealyCrawler', 'Disallow: /'].join('\n');
    const checker = new RobotsChecker('DealyCrawler', fakeFetch({ body }));
    expect(await checker.isAllowed('https://shop.test/anything')).toBe('disallowed');
  });

  it('lets a longer Allow override a shorter Disallow (longest-match wins)', async () => {
    const body = ['User-agent: *', 'Disallow: /deals', 'Allow: /deals/public'].join('\n');
    const checker = new RobotsChecker('DealyCrawler', fakeFetch({ body }));
    expect(await checker.isAllowed('https://shop.test/deals/public/x')).toBe('allowed');
    expect(await checker.isAllowed('https://shop.test/deals/private')).toBe('disallowed');
  });

  it('treats a 404 robots.txt as no restrictions (allowed)', async () => {
    const checker = new RobotsChecker('DealyCrawler', fakeFetch({ status: 404 }));
    expect(await checker.isAllowed('https://shop.test/anything')).toBe('allowed');
  });

  it('fails open (unreachable) on a network error', async () => {
    const checker = new RobotsChecker('DealyCrawler', fakeFetch({ throws: true }));
    expect(await checker.isAllowed('https://shop.test/anything')).toBe('unreachable');
  });

  it('fails open (unreachable) on a 5xx', async () => {
    const checker = new RobotsChecker('DealyCrawler', fakeFetch({ status: 503 }));
    expect(await checker.isAllowed('https://shop.test/anything')).toBe('unreachable');
  });

  it('caches robots.txt per origin (one fetch for repeat checks)', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => 'User-agent: *\nDisallow: /x',
      };
    }) as unknown as typeof fetch;
    const checker = new RobotsChecker('DealyCrawler', fetchFn);
    await checker.isAllowed('https://shop.test/a');
    await checker.isAllowed('https://shop.test/b');
    expect(calls).toBe(1);
  });
});
