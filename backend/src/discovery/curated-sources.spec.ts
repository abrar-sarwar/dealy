import { crawlSources, regionalInventories } from '../../prisma/seed';
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

describe('curated source category balance', () => {
  const dist = () => {
    const m = new Map<string, number>();
    for (const s of crawlSources)
      m.set(s.defaultCategorySlug, (m.get(s.defaultCategorySlug) ?? 0) + 1);
    return m;
  };

  it('every source declares a valid category slug', () => {
    const ok = new Set([
      'food',
      'groceries',
      'tech',
      'studentSupplies',
      'clothing',
      'entertainment',
      'beauty',
      'automotive',
      'home',
      'books',
    ]);
    for (const s of crawlSources) expect(ok.has(s.defaultCategorySlug)).toBe(true);
  });

  it('covers a diverse category mix (food, entertainment, student, beauty, grocery all present)', () => {
    const d = dist();
    for (const cat of ['food', 'entertainment', 'studentSupplies', 'beauty', 'groceries']) {
      expect(d.get(cat) ?? 0).toBeGreaterThan(0);
    }
  });

  it('is not grocery-dominated (groceries < 30% of sources)', () => {
    const grocery = dist().get('groceries') ?? 0;
    expect(grocery / crawlSources.length).toBeLessThan(0.3);
  });

  it('homepage-style sources (no already-targeted path) declare dealUrl or targetPaths', () => {
    for (const s of crawlSources) {
      const path = new URL(s.url).pathname;
      const targeted = allowed.some((p) => path.includes(p));
      if (!targeted) expect(Boolean(s.dealUrl) || (s.targetPaths?.length ?? 0) > 0).toBe(true);
    }
  });
});

describe('campus student-discount lane sources', () => {
  it('every campus (gsu, gt, ksu, uga) has at least one student_discount source', () => {
    const campuses = ['gsu', 'gt', 'ksu', 'uga'];
    for (const campus of campuses) {
      const found = crawlSources.some(
        (s) => s.zoneSlug === campus && s.kind === 'student_discount',
      );
      expect(found).toBe(true);
    }
  });

  it('all campus student-discount newspaper sources resolve to a non-bare URL', () => {
    const studentNewspapers = crawlSources.filter(
      (s) =>
        ['gsu', 'gt', 'ksu', 'uga'].includes(s.zoneSlug) &&
        s.kind === 'student_discount' &&
        ['ksusentinel.com', 'studentcenter.gsu.edu', 'nique.net', 'redandblack.com'].some((d) =>
          s.url.includes(d),
        ),
    );
    expect(studentNewspapers.length).toBe(4);
    for (const s of studentNewspapers) {
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
});

describe('regionalInventories seed', () => {
  it('seeds an inventory for every pilot zone so promotion has a region to attach to', () => {
    const slugs = new Set(regionalInventories.map((r) => r.regionSlug));
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
      expect(slugs.has(z)).toBe(true);
    }
  });

  it('gives every region a centroid (promoted deals derive coordinates from it)', () => {
    for (const r of regionalInventories) {
      expect(typeof r.latitude).toBe('number');
      expect(typeof r.longitude).toBe('number');
      expect(r.radiusMiles).toBeGreaterThan(0);
    }
  });
});
