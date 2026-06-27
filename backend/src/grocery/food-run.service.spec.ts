import { FoodRunService, type FoodRunPlace } from './food-run.service';

function place(p: Partial<FoodRunPlace> & Pick<FoodRunPlace, 'id' | 'name'>): FoodRunPlace {
  return {
    categorySlug: 'food',
    latitude: 33.75,
    longitude: -84.39,
    rating: 4,
    priceBucket: '$$',
    affordabilityScore: 0.5,
    cheapEatsScore: 0.5,
    studentValueScore: 0.5,
    hiddenGemScore: 0.3,
    dealLikelihoodScore: 0.3,
    bestFor: null,
    vibeTags: [],
    categoryTags: [],
    whyRecommended: null,
    budgetTip: null,
    primaryPhotoUrl: null,
    curatedStudentFriendly: false,
    ...p,
  };
}

// rankPlaces is pure → null prisma/placeFeed are never touched.
const svc = new FoodRunService(null as never, null as never);
const CENTER = { latitude: 33.753, longitude: -84.386 };

/** Build a service whose DB is mocked to return `places` + no deals. */
function svcWith(places: FoodRunPlace[], region: string | null = 'atl'): FoodRunService {
  const prisma = {
    place: { findMany: async (): Promise<FoodRunPlace[]> => places },
    deal: { findFirst: async (): Promise<null> => null },
  };
  const placeFeed = { resolveRegion: async (): Promise<string | null> => region };
  return new FoodRunService(prisma as never, placeFeed as never);
}

describe('FoodRunService.rankPlaces', () => {
  it('under_10 ranks the cheap-eats place first', () => {
    const cheap = place({
      id: 'cheap',
      name: 'Dollar Tacos',
      priceBucket: '$',
      cheapEatsScore: 0.95,
      affordabilityScore: 0.95,
    });
    const pricey = place({
      id: 'pricey',
      name: 'Steakhouse',
      priceBucket: '$$$',
      cheapEatsScore: 0.1,
      affordabilityScore: 0.1,
    });
    const ranked = svc.rankPlaces([pricey, cheap], 'under_10', CENTER);
    expect(ranked[0].place.id).toBe('cheap');
  });

  it('study_spot ranks the cafe with study vibes first', () => {
    const cafe = place({
      id: 'cafe',
      name: 'Quiet Beans',
      categorySlug: 'cafe',
      vibeTags: ['study', 'wifi', 'quiet'],
    });
    const bar = place({ id: 'bar', name: 'Loud Pub', categorySlug: 'food', vibeTags: ['party'] });
    const ranked = svc.rankPlaces([bar, cafe], 'study_spot', CENTER);
    expect(ranked[0].place.id).toBe('cafe');
  });

  it('closest_cheap prefers the nearer affordable place', () => {
    const near = place({
      id: 'near',
      name: 'Near Deli',
      latitude: 33.753,
      longitude: -84.386,
      priceBucket: '$',
      affordabilityScore: 0.8,
    });
    const far = place({
      id: 'far',
      name: 'Far Deli',
      latitude: 34.2,
      longitude: -84.9,
      priceBucket: '$',
      affordabilityScore: 0.8,
    });
    const ranked = svc.rankPlaces([far, near], 'closest_cheap', CENTER);
    expect(ranked[0].place.id).toBe('near');
  });

  it('returns an empty ranking for no places', () => {
    expect(svc.rankPlaces([], 'under_10', CENTER)).toEqual([]);
  });

  it('student_friendly ranks the curated place first', () => {
    const curated = place({
      id: 'curated',
      name: 'Campus Grill',
      studentValueScore: 0.5,
      curatedStudentFriendly: true,
    });
    const plain = place({ id: 'plain', name: 'Generic Eats', studentValueScore: 0.5 });
    const ranked = svc.rankPlaces([plain, curated], 'student_friendly', CENTER);
    expect(ranked[0].place.id).toBe('curated');
  });

  it('cheapest ranks the most affordable place first', () => {
    const aff = place({
      id: 'aff',
      name: 'Budget Bowls',
      priceBucket: '$',
      affordabilityScore: 0.95,
      cheapEatsScore: 0.9,
    });
    const exp = place({
      id: 'exp',
      name: 'Bistro',
      priceBucket: '$$$',
      affordabilityScore: 0.2,
      cheapEatsScore: 0.2,
    });
    const ranked = svc.rankPlaces([exp, aff], 'cheapest', CENTER);
    expect(ranked[0].place.id).toBe('aff');
  });

  it('maxDistanceMiles drops places beyond the radius', () => {
    const near = place({ id: 'near', name: 'Near', latitude: 33.753, longitude: -84.386 });
    const far = place({ id: 'far', name: 'Far', latitude: 33.8, longitude: -84.45 }); // ~4-5 mi
    const ranked = svc.rankPlaces([near, far], 'best_value', CENTER, { maxDistanceMiles: 2 });
    expect(ranked.map((r) => r.place.id)).toEqual(['near']);
  });

  it('allowChains=false excludes known chains', () => {
    const chain = place({ id: 'chain', name: "McDonald's #123" });
    const local = place({ id: 'local', name: 'Mom & Pop Diner' });
    const ranked = svc.rankPlaces([chain, local], 'best_value', CENTER, { allowChains: false });
    expect(ranked.map((r) => r.place.id)).toEqual(['local']);
  });

  it('allowLocal=false excludes independents (keeps chains)', () => {
    const chain = place({ id: 'chain', name: 'Chipotle Mexican Grill' });
    const local = place({ id: 'local', name: 'Mom & Pop Diner' });
    const ranked = svc.rankPlaces([chain, local], 'best_value', CENTER, { allowLocal: false });
    expect(ranked.map((r) => r.place.id)).toEqual(['chain']);
  });

  it('chainClassification overrides the name heuristic for the chain filter', () => {
    // Name looks like a chain ("Subway") but classified local → kept when allowChains=false.
    const localNamedLikeChain = place({
      id: 'local',
      name: 'Subway Cafe Local',
      chainClassification: 'local',
    });
    const trueChain = place({
      id: 'chain',
      name: 'Indie Spot',
      chainClassification: 'chain',
    });
    const ranked = svc.rankPlaces([localNamedLikeChain, trueChain], 'best_value', CENTER, {
      allowChains: false,
    });
    expect(ranked.map((r) => r.place.id)).toEqual(['local']);
  });

  it('lateNight flag boosts the late_night goal even without late tags', () => {
    const late = place({ id: 'late', name: 'Night Owl Diner', lateNight: true });
    const day = place({ id: 'day', name: 'Daytime Deli', lateNight: false });
    const ranked = svc.rankPlaces([day, late], 'late_night', CENTER);
    expect(ranked[0].place.id).toBe('late');
  });

  it('studySpot flag boosts the study_spot goal', () => {
    const study = place({ id: 'study', name: 'Focus Room', studySpot: true });
    const noisy = place({ id: 'noisy', name: 'Loud Grill', studySpot: false });
    const ranked = svc.rankPlaces([noisy, study], 'study_spot', CENTER);
    expect(ranked[0].place.id).toBe('study');
  });

  it('launchRegionPriority breaks ties between otherwise-equal places', () => {
    const base = { name: 'Twin', priceBucket: '$' as const };
    const prioritized = place({ id: 'pri', ...base, launchRegionPriority: 5 });
    const plain = place({ id: 'plain', ...base, launchRegionPriority: 0 });
    const ranked = svc.rankPlaces([plain, prioritized], 'best_value', CENTER);
    expect(ranked[0].place.id).toBe('pri');
  });

  it('uses estimatedMealMin/MaxMinor for budget fit when present', () => {
    // Both priced bucket $$ but meal estimates differ; the cheaper-by-estimate
    // place should win under_10 budget fit.
    const cheapEstimate = place({
      id: 'cheap',
      name: 'Value Bowls',
      priceBucket: '$$',
      estimatedMealMinMinor: 600,
      estimatedMealMaxMinor: 800,
    });
    const pricyEstimate = place({
      id: 'pricy',
      name: 'Splurge Bowls',
      priceBucket: '$$',
      estimatedMealMinMinor: 2800,
      estimatedMealMaxMinor: 3400,
    });
    const ranked = svc.rankPlaces([pricyEstimate, cheapEstimate], 'under_10', CENTER, {
      budgetMinor: 1000,
    });
    expect(ranked[0].place.id).toBe('cheap');
  });
});

describe('FoodRunService.bestPlace new-field surfacing', () => {
  function svcWith2(places: FoodRunPlace[]): FoodRunService {
    const prisma = {
      place: { findMany: async (): Promise<FoodRunPlace[]> => places },
      deal: { findFirst: async (): Promise<null> => null },
    };
    const placeFeed = { resolveRegion: async (): Promise<string | null> => 'gsu' };
    return new FoodRunService(prisma as never, placeFeed as never);
  }

  it('recommendedOrder overrides budget tip for recommended_order', async () => {
    const p = place({
      id: 'p',
      name: 'Campus Eats',
      budgetTip: 'generic tip',
      recommendedOrder: 'Get the $6 combo',
    });
    const res = await svcWith2([p]).bestPlace({
      latitude: CENTER.latitude,
      longitude: CENTER.longitude,
      goal: 'best_value',
    });
    expect(res.recommended_order).toBe('Get the $6 combo');
  });

  it('surfaces late night + quiet study tags from the flags', async () => {
    const p = place({ id: 'p', name: 'Owl Study', lateNight: true, studySpot: true });
    const res = await svcWith2([p]).bestPlace({
      latitude: CENTER.latitude,
      longitude: CENTER.longitude,
      goal: 'best_value',
    });
    expect(res.place?.tags).toEqual(expect.arrayContaining(['late night', 'quiet study']));
  });
});

describe('FoodRunService.bestPlace', () => {
  it('returns ranking_label, tags and ranked_alternatives in the response', async () => {
    const places = [
      place({
        id: 'a',
        name: 'Taco Spot',
        priceBucket: '$',
        cheapEatsScore: 0.9,
        affordabilityScore: 0.9,
      }),
      place({ id: 'b', name: 'Burrito Bar', priceBucket: '$', cheapEatsScore: 0.8 }),
      place({ id: 'c', name: 'Salad Place', priceBucket: '$$', vibeTags: ['healthy', 'salad'] }),
    ];
    const res = await svcWith(places).bestPlace({
      latitude: CENTER.latitude,
      longitude: CENTER.longitude,
      goal: 'under_10',
      budgetMinor: 1000,
    });
    expect(res.place).not.toBeNull();
    expect(typeof res.ranking_label).toBe('string');
    expect(Array.isArray(res.tags)).toBe(true);
    expect(res.ranked_alternatives.length).toBeGreaterThan(0);
    expect(res.place?.distance_miles).toBeDefined();
    expect(res.place?.tags).toContain('under $10');
  });

  it('labels the best "Skip today if too expensive" when it busts the budget', async () => {
    const places = [
      place({ id: 'pricey', name: 'Steakhouse', priceBucket: '$$$', affordabilityScore: 0.2 }),
    ];
    const res = await svcWith(places).bestPlace({
      latitude: CENTER.latitude,
      longitude: CENTER.longitude,
      goal: 'under_10',
      budgetMinor: 1000, // $10 budget, est ~ $30
    });
    expect(res.ranking_label).toBe('Skip today if too expensive');
  });

  it('out-of-area still returns the best available place at low confidence', async () => {
    const far = place({ id: 'far', name: 'Far Eats', latitude: 34.4, longitude: -85.1 });
    const res = await svcWith([far], null).bestPlace({
      latitude: CENTER.latitude,
      longitude: CENTER.longitude,
      goal: 'best_value',
    });
    expect(res.place?.id).toBe('far');
    expect(res.confidence).toBe('low');
  });

  it('returns a null place only when there are no places at all', async () => {
    const res = await svcWith([], null).bestPlace({
      latitude: CENTER.latitude,
      longitude: CENTER.longitude,
      goal: 'best_value',
    });
    expect(res.place).toBeNull();
    expect(res.ranked_alternatives).toEqual([]);
  });
});
