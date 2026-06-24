import { crawlSources } from '../../prisma/seed';
import { resolveCrawlTargets } from './url-targeting';

const allowed = [
  '/deals',
  '/coupons',
  '/promotions',
  '/offers',
  '/weekly-ad',
  '/weeklyad',
  '/weekly-specials',
  '/specials',
  '/student-discounts',
  '/events',
  '/restaurants',
];

describe('curated crawlSources seed', () => {
  it('covers all pilot zones', () => {
    const zones = new Set(crawlSources.map((s) => s.zoneSlug));
    for (const z of [
      'atlanta',
      'midtown',
      'buckhead',
      'downtown',
      'gsu',
      'gt',
      'ksu',
      'uga',
      'cartersville',
    ]) {
      expect(zones.has(z)).toBe(true);
    }
  });

  it('uses known source types', () => {
    const ok = new Set(['merchant_site', 'weekly_ad', 'coupon_page', 'student_platform']);
    for (const s of crawlSources) expect(ok.has(s.sourceType)).toBe(true);
  });

  it('every source resolves to at least one targeted (non-bare) URL', () => {
    for (const s of crawlSources) {
      const targets = resolveCrawlTargets({
        websiteUrl: s.url,
        dealUrl: s.dealUrl,
        targetPaths: s.targetPaths,
        allowedPaths: allowed,
      });
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) expect(t).not.toMatch(/^https?:\/\/[^/]+\/?$/);
    }
  });

  it('does not synthesize a path for a URL that is already a deal page', () => {
    const publix = crawlSources.find((s) => s.merchantHint === 'Publix')!;
    expect(
      resolveCrawlTargets({
        websiteUrl: publix.url,
        dealUrl: publix.dealUrl,
        targetPaths: publix.targetPaths,
        allowedPaths: allowed,
      }),
    ).toEqual(['https://www.publix.com/savings/weekly-ad']);
  });
});
