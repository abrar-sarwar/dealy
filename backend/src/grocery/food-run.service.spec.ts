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
    bestFor: null,
    vibeTags: [],
    categoryTags: [],
    whyRecommended: null,
    budgetTip: null,
    primaryPhotoUrl: null,
    ...p,
  };
}

// rankPlaces is pure → null prisma/placeFeed are never touched.
const svc = new FoodRunService(null as never, null as never);
const CENTER = { latitude: 33.753, longitude: -84.386 };

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
});
