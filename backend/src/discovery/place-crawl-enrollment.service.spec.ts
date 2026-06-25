import { PlaceCrawlEnrollmentService, isEligiblePlace } from './place-crawl-enrollment.service';

type Place = {
  id: string;
  name: string;
  website: string | null;
  categorySlug: string;
  googleTypes: string[];
  regionSlug: string;
  campusSlug: string | null;
};

function place(over: Partial<Place> = {}): Place {
  return {
    id: 'p1',
    name: 'Joe Coffee',
    website: 'https://joecoffee.example',
    categorySlug: 'food',
    googleTypes: ['cafe', 'food', 'point_of_interest'],
    regionSlug: 'gsu',
    campusSlug: null,
    ...over,
  };
}

/** Minimal Prisma double: place.findMany returns the seeded places; crawlSource
 *  upsert keyed on placeId, so re-enrollment is exercised as an update. */
function makePrisma(places: Place[]) {
  const sources = new Map<string, Record<string, unknown>>();
  return {
    sources,
    place: {
      findMany: jest.fn(async () => places),
    },
    crawlSource: {
      findUnique: jest.fn(async (args: { where: { placeId: string } }) => {
        const row = sources.get(args.where.placeId);
        return row ? { id: row.placeId } : null;
      }),
      upsert: jest.fn(
        async (args: {
          where: { placeId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const key = args.where.placeId;
          const existing = sources.get(key);
          if (existing) {
            const merged = { ...existing, ...args.update };
            sources.set(key, merged);
            return merged;
          }
          sources.set(key, { ...args.create });
          return args.create;
        },
      ),
    },
  };
}

function build(prisma: ReturnType<typeof makePrisma>) {
  return new PlaceCrawlEnrollmentService(prisma as never);
}

describe('isEligiblePlace', () => {
  it('eligible: website + food category', () => {
    expect(isEligiblePlace(place())).toBe('eligible');
  });

  it('skipped: no website', () => {
    expect(isEligiblePlace(place({ website: null }))).toBe('no-website');
  });

  it('skipped: non-useful category (entertainment / non-consumer)', () => {
    expect(
      isEligiblePlace(
        place({ categorySlug: 'entertainment', googleTypes: ['movie_theater', 'establishment'] }),
      ),
    ).toBe('category');
  });

  it('eligible: barber via google types even when categorySlug is generic', () => {
    expect(
      isEligiblePlace(
        place({ categorySlug: 'services', googleTypes: ['hair_care', 'barber_shop'] }),
      ),
    ).toBe('eligible');
  });

  it('eligible: gym/fitness', () => {
    expect(isEligiblePlace(place({ categorySlug: 'health', googleTypes: ['gym'] }))).toBe(
      'eligible',
    );
  });

  it('eligible: car repair / auto', () => {
    expect(
      isEligiblePlace(place({ categorySlug: 'automotive', googleTypes: ['car_repair'] })),
    ).toBe('eligible');
  });
});

describe('PlaceCrawlEnrollmentService.enrollRegion', () => {
  it('enrolls eligible places and tallies the log', async () => {
    const prisma = makePrisma([
      place({ id: 'a', name: 'A', website: 'https://a.com' }),
      place({ id: 'b', name: 'B', website: null }), // no website
      place({
        id: 'c',
        name: 'C',
        website: 'https://c.com',
        categorySlug: 'entertainment',
        googleTypes: ['movie_theater'],
      }), // bad category
    ]);
    const log = await build(prisma).enrollRegion('gsu');
    expect(log.regionSlug).toBe('gsu');
    expect(log.placesConsidered).toBe(3);
    expect(log.eligible).toBe(1);
    expect(log.skippedNoWebsite).toBe(1);
    expect(log.skippedCategory).toBe(1);
    expect(log.enrolled).toBe(1);
    expect(log.alreadyEnrolled).toBe(0);
    expect(prisma.crawlSource.upsert).toHaveBeenCalledTimes(1);
  });

  it('upserts a place-keyed CrawlSource with the homepage url, empty targetPaths and no dealUrl', async () => {
    const prisma = makePrisma([place({ id: 'a', name: 'A', website: 'https://a.com' })]);
    await build(prisma).enrollRegion('gsu');
    const created = prisma.sources.get('a')!;
    expect(created.url).toBe('https://a.com');
    expect(created.placeId).toBe('a');
    expect(created.zoneSlug).toBe('gsu');
    expect(created.merchantHint).toBe('A');
    expect(created.enabled).toBe(true);
    expect(created.dealUrl).toBeNull();
    expect(created.targetPaths).toEqual([]);
  });

  it('caps at maxPlaces (default 25)', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      place({ id: `p${i}`, name: `P${i}`, website: `https://p${i}.com` }),
    );
    const prisma = makePrisma(many);
    const log = await build(prisma).enrollRegion('gsu');
    expect(log.eligible).toBe(30);
    expect(log.enrolled).toBe(25);
    expect(prisma.crawlSource.upsert).toHaveBeenCalledTimes(25);
  });

  it('respects an explicit maxPlaces', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      place({ id: `p${i}`, name: `P${i}`, website: `https://p${i}.com` }),
    );
    const prisma = makePrisma(many);
    const log = await build(prisma).enrollRegion('gsu', { maxPlaces: 4 });
    expect(log.enrolled).toBe(4);
  });

  it('running twice does not double-enroll (upsert → alreadyEnrolled)', async () => {
    const places = [
      place({ id: 'a', name: 'A', website: 'https://a.com' }),
      place({ id: 'b', name: 'B', website: 'https://b.com' }),
    ];
    const prisma = makePrisma(places);
    const svc = build(prisma);
    const first = await svc.enrollRegion('gsu');
    expect(first.enrolled).toBe(2);
    expect(first.alreadyEnrolled).toBe(0);

    const second = await svc.enrollRegion('gsu');
    expect(second.enrolled).toBe(0);
    expect(second.alreadyEnrolled).toBe(2);
    // No duplicate sources — still exactly two rows keyed by placeId.
    expect(prisma.sources.size).toBe(2);
  });
});
