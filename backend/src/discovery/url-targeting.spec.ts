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

  it('refuses to crawl a bare domain with no targeted path', () => {
    expect(
      resolveCrawlTargets({
        websiteUrl: 'https://shop.com/',
        dealUrl: null,
        targetPaths: [],
        allowedPaths: allowed,
      }),
    ).toEqual([]);
  });
});
