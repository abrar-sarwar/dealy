import { PlaceFeedService, type FeedPlace } from './place-feed.service';

function fp(over: Partial<FeedPlace> = {}): FeedPlace {
  return {
    id: over.id ?? 'p1',
    name: over.name ?? 'Place',
    categorySlug: over.categorySlug ?? 'food',
    regionSlug: over.regionSlug ?? 'gsu',
    address: over.address ?? null,
    bestFor: over.bestFor ?? null,
    vibeTags: over.vibeTags ?? [],
    confidenceLabel: over.confidenceLabel ?? null,
    latitude: over.latitude ?? 33.753,
    longitude: over.longitude ?? -84.386,
    rating: over.rating ?? 4.2,
    userRatingsTotal: over.userRatingsTotal ?? 100,
    priceBucket: over.priceBucket ?? '$$',
    studentValueScore: over.studentValueScore ?? 0.3,
    affordabilityScore: over.affordabilityScore ?? 0.3,
    dealLikelihoodScore: over.dealLikelihoodScore ?? 0.1,
    hiddenGemScore: over.hiddenGemScore ?? 0.1,
    cheapEatsScore: over.cheapEatsScore ?? 0.1,
    whyRecommended: over.whyRecommended ?? 'why',
    website: 'website' in over ? over.website! : 'https://x.example',
    enrichedAt: over.enrichedAt ?? new Date(),
    primaryPhotoUrl: 'primaryPhotoUrl' in over ? over.primaryPhotoUrl! : null,
    imageStatus: over.imageStatus ?? 'none',
    feedSectionCandidates: over.feedSectionCandidates ?? [],
  };
}

function makePrisma(rows: FeedPlace[]) {
  const findMany = jest.fn<Promise<FeedPlace[]>, [{ where: Record<string, unknown> }]>(
    async () => rows,
  );
  return { findMany, prisma: { place: { findMany } } };
}

describe('PlaceFeedService.sections', () => {
  it('reads ONLY stored fields — zero Gemini calls (no gemini dependency at all)', async () => {
    const { prisma, findMany } = makePrisma([fp()]);
    const svc = new PlaceFeedService(prisma as never);
    await svc.sections('gsu');
    expect(findMany).toHaveBeenCalledTimes(1);
    // Constructor takes only prisma — there is structurally no Gemini to call.
  });

  it('only considers enriched places (enrichedAt not null filter passed to prisma)', async () => {
    const { prisma, findMany } = makePrisma([]);
    const svc = new PlaceFeedService(prisma as never);
    await svc.sections('gsu');
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ regionSlug: 'gsu', enrichedAt: { not: null } });
  });

  it('buckets a high cheap-eats food place into cheap_eats', async () => {
    const cheap = fp({
      id: 'cheap',
      categorySlug: 'food',
      cheapEatsScore: 0.95,
      affordabilityScore: 0.9,
      rating: 4.4,
    });
    const other = fp({ id: 'other', categorySlug: 'food', cheapEatsScore: 0.05, rating: 4.0 });
    const { prisma } = makePrisma([cheap, other]);
    const svc = new PlaceFeedService(prisma as never);

    const sections = await svc.sections('gsu');
    const cheapEats = sections.find((s) => s.key === 'cheap_eats')!;
    expect(cheapEats.places[0].id).toBe('cheap');
    expect(cheapEats.places[0].score).toBeGreaterThan(0);
  });

  it('buckets a high hidden-gem place into hidden_gem', async () => {
    const gem = fp({ id: 'gem', hiddenGemScore: 0.9, userRatingsTotal: 12 });
    const plain = fp({ id: 'plain', hiddenGemScore: 0.05, userRatingsTotal: 500 });
    const { prisma } = makePrisma([gem, plain]);
    const svc = new PlaceFeedService(prisma as never);

    const sections = await svc.sections('gsu');
    const hidden = sections.find((s) => s.key === 'hidden_gem')!;
    expect(hidden.places[0].id).toBe('gem');
  });

  it('highly_rated requires a minimum review count', async () => {
    const popular = fp({ id: 'pop', rating: 4.8, userRatingsTotal: 800 });
    const sparse = fp({ id: 'sparse', rating: 5.0, userRatingsTotal: 3 });
    const { prisma } = makePrisma([popular, sparse]);
    const svc = new PlaceFeedService(prisma as never);

    const sections = await svc.sections('gsu');
    const rated = sections.find((s) => s.key === 'highly_rated')!;
    expect(rated.places.map((p) => p.id)).toContain('pop');
    expect(rated.places.map((p) => p.id)).not.toContain('sparse');
  });

  it('worth_checking_deals requires a website and ranks by dealLikelihood', async () => {
    const dealy = fp({ id: 'dealy', dealLikelihoodScore: 0.9, website: 'https://d.example' });
    const noSite = fp({ id: 'nosite', dealLikelihoodScore: 0.95, website: null });
    const { prisma } = makePrisma([dealy, noSite]);
    const svc = new PlaceFeedService(prisma as never);

    const sections = await svc.sections('gsu');
    const deals = sections.find((s) => s.key === 'worth_checking_deals')!;
    expect(deals.places.map((p) => p.id)).toEqual(['dealy']);
  });

  it('caps each section at the limit', async () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      fp({ id: `p${i}`, studentValueScore: 0.5 + i / 100 }),
    );
    const { prisma } = makePrisma(rows);
    const svc = new PlaceFeedService(prisma as never);

    const sections = await svc.sections('gsu', { limit: 10 });
    const student = sections.find((s) => s.key === 'student_friendly')!;
    expect(student.places.length).toBe(10);
  });

  it('projects the enriched detail fields onto each ranked place', async () => {
    const detailed = fp({
      id: 'detailed',
      categorySlug: 'food',
      cheapEatsScore: 0.95,
      affordabilityScore: 0.9,
      rating: 4.4,
      address: '123 Peachtree St',
      latitude: 33.7,
      longitude: -84.39,
      bestFor: 'Late-night study fuel',
      vibeTags: ['cozy', 'cheap'],
      studentValueScore: 0.8,
      confidenceLabel: 'high',
    });
    const { prisma } = makePrisma([detailed]);
    const svc = new PlaceFeedService(prisma as never);

    const sections = await svc.sections('gsu');
    const place = sections.find((s) => s.key === 'cheap_eats')!.places[0];
    expect(place).toMatchObject({
      id: 'detailed',
      categorySlug: 'food',
      address: '123 Peachtree St',
      latitude: 33.7,
      longitude: -84.39,
      bestFor: 'Late-night study fuel',
      vibeTags: ['cozy', 'cheap'],
      studentValueScore: 0.8,
      confidenceLabel: 'high',
    });
  });

  it('includes primaryPhotoUrl + imageStatus on ranked places (nullable)', async () => {
    const withPhoto = fp({
      id: 'withphoto',
      cheapEatsScore: 0.95,
      affordabilityScore: 0.9,
      rating: 4.4,
      primaryPhotoUrl: 'https://lh3.googleusercontent.com/x=s1600',
      imageStatus: 'fetched',
    });
    const { prisma } = makePrisma([withPhoto]);
    const svc = new PlaceFeedService(prisma as never);
    const place = (await svc.sections('gsu')).find((s) => s.key === 'cheap_eats')!.places[0];
    expect(place.primaryPhotoUrl).toBe('https://lh3.googleusercontent.com/x=s1600');
    expect(place.imageStatus).toBe('fetched');
  });
});

describe('PlaceFeedService.mapMarkers', () => {
  function makeMapPrisma(rows: FeedPlace[]) {
    const findMany = jest.fn(async () => rows);
    return { findMany, prisma: { place: { findMany } } };
  }

  it('returns bounded markers (default ~40)', async () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      fp({ id: `p${i}`, latitude: 33.75 + i / 1000, longitude: -84.38 }),
    );
    const { prisma } = makeMapPrisma(rows);
    const svc = new PlaceFeedService(prisma as never);
    const markers = await svc.mapMarkers('gsu', { center: { latitude: 33.75, longitude: -84.38 } });
    expect(markers.length).toBe(40);
  });

  it('respects an explicit limit', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => fp({ id: `p${i}` }));
    const { prisma } = makeMapPrisma(rows);
    const svc = new PlaceFeedService(prisma as never);
    const markers = await svc.mapMarkers('gsu', { limit: 5 });
    expect(markers.length).toBe(5);
  });

  it('includes the map payload fields incl. nullable primaryPhotoUrl + markerKind', async () => {
    const row = fp({
      id: 'm1',
      name: 'Marker Cafe',
      categorySlug: 'food',
      latitude: 33.7,
      longitude: -84.39,
      priceBucket: '$',
      rating: 4.6,
      whyRecommended: 'Great value',
      primaryPhotoUrl: 'https://lh3.googleusercontent.com/m1=s1600',
      imageStatus: 'fetched',
      cheapEatsScore: 0.9,
    });
    const { prisma } = makeMapPrisma([row]);
    const svc = new PlaceFeedService(prisma as never);
    const [marker] = await svc.mapMarkers('gsu');
    expect(marker).toMatchObject({
      id: 'm1',
      name: 'Marker Cafe',
      categorySlug: 'food',
      latitude: 33.7,
      longitude: -84.39,
      priceBucket: '$',
      rating: 4.6,
      whyRecommended: 'Great value',
      primaryPhotoUrl: 'https://lh3.googleusercontent.com/m1=s1600',
      imageStatus: 'fetched',
    });
    expect(typeof marker.markerKind).toBe('string');
  });

  it('derives markerKind from top feed section candidate', async () => {
    const gem = fp({ id: 'gem', feedSectionCandidates: ['hidden_gem'], categorySlug: 'food' });
    const student = fp({
      id: 'student',
      feedSectionCandidates: ['student_friendly'],
      categorySlug: 'food',
    });
    const deal = fp({
      id: 'deal',
      feedSectionCandidates: ['worth_checking_deals'],
      categorySlug: 'food',
    });
    const { prisma } = makeMapPrisma([gem, student, deal]);
    const svc = new PlaceFeedService(prisma as never);
    const markers = await svc.mapMarkers('gsu');
    const byId = Object.fromEntries(markers.map((m) => [m.id, m.markerKind]));
    expect(byId['gem']).toBe('hidden_gem');
    expect(byId['student']).toBe('student');
    expect(byId['deal']).toBe('deal');
  });

  it('falls back to category-derived markerKind (cafe/food/service)', async () => {
    const cafe = fp({ id: 'cafe', categorySlug: 'cafe', feedSectionCandidates: [] });
    const food = fp({ id: 'food', categorySlug: 'food', feedSectionCandidates: [] });
    const svc = fp({ id: 'svc', categorySlug: 'services', feedSectionCandidates: [] });
    const { prisma } = makeMapPrisma([cafe, food, svc]);
    const service = new PlaceFeedService(prisma as never);
    const markers = await service.mapMarkers('gsu');
    const byId = Object.fromEntries(markers.map((m) => [m.id, m.markerKind]));
    expect(byId['cafe']).toBe('cafe');
    expect(byId['food']).toBe('food');
    expect(byId['svc']).toBe('service');
  });

  it('filters by radius when provided', async () => {
    const near = fp({ id: 'near', latitude: 33.7531, longitude: -84.3857 });
    const far = fp({ id: 'far', latitude: 34.5, longitude: -84.0 }); // ~50+ miles away
    const { prisma } = makeMapPrisma([near, far]);
    const svc = new PlaceFeedService(prisma as never);
    const markers = await svc.mapMarkers('gsu', {
      center: { latitude: 33.7531, longitude: -84.3857 },
      radiusMiles: 5,
    });
    expect(markers.map((m) => m.id)).toEqual(['near']);
  });
});

describe('PlaceFeedService.resolveRegion (nearest by location)', () => {
  const regions = [
    { regionSlug: 'gsu', latitude: 33.7531, longitude: -84.3857 },
    { regionSlug: 'midtown', latitude: 33.7838, longitude: -84.3825 },
    { regionSlug: 'uga', latitude: 33.948, longitude: -83.3773 },
    { regionSlug: 'kennesaw', latitude: 34.0234, longitude: -84.6155 },
  ];

  function makeInvPrisma() {
    const findMany = jest.fn(async () => regions);
    return {
      prisma: { place: { findMany: jest.fn(async () => []) }, regionalInventory: { findMany } },
    };
  }

  it('picks the GSU region for a downtown-Atlanta-ish coordinate', async () => {
    const { prisma } = makeInvPrisma();
    const svc = new PlaceFeedService(prisma as never);
    const slug = await svc.resolveRegion({ latitude: 33.7525, longitude: -84.386 });
    expect(slug).toBe('gsu');
  });

  it('picks UGA for an Athens coordinate', async () => {
    const { prisma } = makeInvPrisma();
    const svc = new PlaceFeedService(prisma as never);
    const slug = await svc.resolveRegion({ latitude: 33.95, longitude: -83.38 });
    expect(slug).toBe('uga');
  });

  it('returns null when no regions have centroids', async () => {
    const prisma = {
      place: { findMany: jest.fn(async () => []) },
      regionalInventory: { findMany: jest.fn(async () => []) },
    };
    const svc = new PlaceFeedService(prisma as never);
    expect(await svc.resolveRegion({ latitude: 33.75, longitude: -84.38 })).toBeNull();
  });
});
