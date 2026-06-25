import { resolveCrawlTargets } from './url-targeting';

const allowed = [
  '/deals',
  '/coupons',
  '/promotions',
  '/offers',
  '/weekly-ad',
  '/student-discounts',
  '/events',
];

describe('resolveCrawlTargets', () => {
  it('prefers an explicit dealUrl above all else', () => {
    expect(
      resolveCrawlTargets({
        websiteUrl: 'https://shop.com/home',
        dealUrl: 'https://shop.com/x/deals',
        targetPaths: ['/coupons'],
        allowedPaths: allowed,
      }),
    ).toEqual(['https://shop.com/x/deals']);
  });

  it('keeps a seeded URL whose own path already looks targeted (does NOT synthesize)', () => {
    // The footgun fix: /savings/weekly-ad must be kept verbatim, not rewritten to /weekly-ad.
    expect(
      resolveCrawlTargets({
        websiteUrl: 'https://www.publix.com/savings/weekly-ad',
        dealUrl: null,
        targetPaths: ['/weekly-ad'],
        allowedPaths: allowed,
      }),
    ).toEqual(['https://www.publix.com/savings/weekly-ad']);
  });

  it('synthesizes origin+targetPaths only for a homepage source', () => {
    expect(
      resolveCrawlTargets({
        websiteUrl: 'https://www.studentbeans.com/us',
        dealUrl: null,
        targetPaths: ['/student-discounts'],
        allowedPaths: allowed,
      }),
    ).toEqual(['https://www.studentbeans.com/student-discounts']);
  });

  it('drops targetPaths not in the allowlist', () => {
    expect(
      resolveCrawlTargets({
        websiteUrl: 'https://shop.com/',
        dealUrl: null,
        targetPaths: ['/admin', '/coupons'],
        allowedPaths: allowed,
      }),
    ).toEqual(['https://shop.com/coupons']);
  });

  it('synthesizes the full allowlist for a place-sourced bare domain with empty targetPaths', () => {
    // A place-sourced CrawlSource carries the merchant homepage and targetPaths=[]
    // so the runner crawls the most likely deal-bearing paths. The seed is bare,
    // so every allowed path is synthesized — non-bare, hitting the allowlist.
    const targets = resolveCrawlTargets({
      websiteUrl: 'https://joescoffee.com',
      dealUrl: null,
      targetPaths: [],
      allowedPaths: ['/deals', '/specials', '/menu', '/happy-hour'],
    });
    expect(targets).toEqual([
      'https://joescoffee.com/deals',
      'https://joescoffee.com/specials',
      'https://joescoffee.com/menu',
      'https://joescoffee.com/happy-hour',
    ]);
    for (const t of targets) expect(t).not.toMatch(/^https?:\/\/[^/]+\/?$/);
  });

  it('still refuses to crawl a bare domain when there are no allowed paths to synthesize', () => {
    expect(
      resolveCrawlTargets({
        websiteUrl: 'https://shop.com/',
        dealUrl: null,
        targetPaths: [],
        allowedPaths: [],
      }),
    ).toEqual([]);
  });
});
