import {
  PlaceDiscoveryService,
  CATEGORY_PRESETS,
  resolveCategories,
} from './place-discovery.service';
import type { PlaceResult } from '../services/google-places/google-places.types';

const REGION = {
  id: 'region-1',
  regionSlug: 'gsu',
  regionName: 'Georgia State',
  regionType: 'campus',
  latitude: 33.753,
  longitude: -84.386,
  radiusMiles: 3,
  campusSlug: null as string | null,
};

function placeResult(over: Partial<PlaceResult> = {}): PlaceResult {
  return {
    name: 'Joe Coffee',
    latitude: 33.755,
    longitude: -84.388,
    address: '1 Edgewood Ave, Atlanta, GA',
    placeId: 'gp-1',
    types: ['cafe', 'food', 'point_of_interest'],
    priceLevel: 2,
    rating: 4.5,
    userRatingsTotal: 312,
    website: 'https://joecoffee.example',
    phone: '(404) 555-0100',
    ...over,
  };
}

interface FakeStore {
  rows: Map<string, Record<string, unknown>>;
}

/** Minimal Prisma double: implements regionalInventory.findUnique + place.upsert
 *  with googlePlaceId as the unique key, so dedupe semantics are exercised. */
function makePrisma(store: FakeStore, region = REGION) {
  return {
    regionalInventory: {
      findUnique: jest.fn(async () => region),
    },
    place: {
      upsert: jest.fn(
        async (args: {
          where: { googlePlaceId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const key = args.where.googlePlaceId;
          const existing = store.rows.get(key);
          if (existing) {
            const merged = { ...existing, ...args.update };
            store.rows.set(key, merged);
            return merged;
          }
          store.rows.set(key, { ...args.create });
          return args.create;
        },
      ),
    },
  };
}

function makePlaces(resultsByCall: PlaceResult[][]) {
  let call = 0;
  return {
    nearbySearch: jest.fn(async () => {
      const r = resultsByCall[call] ?? [];
      call++;
      return r;
    }),
  };
}

function build(prisma: ReturnType<typeof makePrisma>, places: ReturnType<typeof makePlaces>) {
  return new PlaceDiscoveryService(prisma as never, places as never);
}

describe('PlaceDiscoveryService.discoverRegion', () => {
  it('maps a nearbySearch result into a Place (types→categorySlug, priceLevel, rating, website)', async () => {
    const store: FakeStore = { rows: new Map() };
    const prisma = makePrisma(store);
    const places = makePlaces([[placeResult()], []]); // restaurant call, cafe call

    const svc = build(prisma, places);
    const summary = await svc.discoverRegion('gsu', { categories: ['cafe'] });

    expect(summary.found).toBe(1);
    expect(summary.stored).toBe(1);
    const row = store.rows.get('gp-1')!;
    expect(row.name).toBe('Joe Coffee');
    expect(row.categorySlug).toBe('food'); // cafe → food
    expect(row.priceLevel).toBe(2);
    expect(row.rating).toBe(4.5);
    expect(row.userRatingsTotal).toBe(312);
    expect(row.website).toBe('https://joecoffee.example');
    expect(row.googleTypes).toEqual(['cafe', 'food', 'point_of_interest']);
    expect(row.regionSlug).toBe('gsu');
    expect(row.source).toBe('google_places');
  });

  it('requests detail fields from Places (includeDetails)', async () => {
    const store: FakeStore = { rows: new Map() };
    const prisma = makePrisma(store);
    const places = makePlaces([[placeResult()]]);
    const svc = build(prisma, places);
    await svc.discoverRegion('gsu', { categories: ['cafe'] });
    expect(places.nearbySearch).toHaveBeenCalledWith(
      expect.objectContaining({ includeDetails: true }),
    );
  });

  it('upserts by googlePlaceId — the same id twice yields one row with updated fields', async () => {
    const store: FakeStore = { rows: new Map() };
    const prisma = makePrisma(store);
    // Same placeId returned by both category calls, second has a fresher rating.
    const places = makePlaces([
      [placeResult({ rating: 4.5, priceLevel: 2 })],
      [placeResult({ rating: 4.8, priceLevel: 3 })],
    ]);
    const svc = build(prisma, places);
    const summary = await svc.discoverRegion('gsu', { categories: ['restaurant', 'cafe'] });

    expect(store.rows.size).toBe(1);
    expect(summary.deduped).toBe(1);
    const row = store.rows.get('gp-1')!;
    expect(row.rating).toBe(4.8); // updated
    expect(row.priceLevel).toBe(3); // updated
  });

  it('caps stored places at maxPlaces and stops calling Places once reached', async () => {
    const store: FakeStore = { rows: new Map() };
    const prisma = makePrisma(store);
    // First category call alone returns 3 distinct places; cap is 2.
    const places = makePlaces([
      [
        placeResult({ placeId: 'a', name: 'A' }),
        placeResult({ placeId: 'b', name: 'B' }),
        placeResult({ placeId: 'c', name: 'C' }),
      ],
      [placeResult({ placeId: 'd', name: 'D' })],
    ]);
    const svc = build(prisma, places);
    const summary = await svc.discoverRegion('gsu', {
      categories: ['restaurant', 'cafe'],
      maxPlaces: 2,
    });

    expect(summary.stored).toBe(2);
    expect(store.rows.size).toBe(2);
    // Cap reached during the first category → the second category call is skipped.
    expect(places.nearbySearch).toHaveBeenCalledTimes(1);
    expect(summary.placesCalls).toBe(1);
  });

  it('stores a result missing optional fields (no website / no price)', async () => {
    const store: FakeStore = { rows: new Map() };
    const prisma = makePrisma(store);
    const bare: PlaceResult = {
      name: 'Bare Spot',
      latitude: 33.75,
      longitude: -84.38,
      address: null,
      placeId: 'gp-bare',
      types: ['restaurant'],
      priceLevel: null,
      rating: null,
      userRatingsTotal: null,
      website: null,
      phone: null,
    };
    const places = makePlaces([[bare]]);
    const svc = build(prisma, places);
    const summary = await svc.discoverRegion('gsu', { categories: ['restaurant'] });

    expect(summary.stored).toBe(1);
    const row = store.rows.get('gp-bare')!;
    expect(row.categorySlug).toBe('food');
    expect(row.website).toBeNull();
    expect(row.priceLevel).toBeNull();
    expect(row.rating).toBeNull();
    expect(row.address).toBeNull();
  });

  it('counts placesCalls (one per category) for cost visibility', async () => {
    const store: FakeStore = { rows: new Map() };
    const prisma = makePrisma(store);
    const places = makePlaces([[placeResult({ placeId: 'x' })], [placeResult({ placeId: 'y' })]]);
    const svc = build(prisma, places);
    const summary = await svc.discoverRegion('gsu', { categories: ['restaurant', 'cafe'] });
    expect(summary.placesCalls).toBe(2);
    expect(summary.found).toBe(2);
    expect(summary.stored).toBe(2);
  });

  it('throws a clear error when the region has no RegionalInventory', async () => {
    const store: FakeStore = { rows: new Map() };
    const prisma = makePrisma(store);
    prisma.regionalInventory.findUnique = jest.fn(async () => null as never);
    const places = makePlaces([[placeResult()]]);
    const svc = build(prisma, places);
    await expect(svc.discoverRegion('nope')).rejects.toThrow(/nope/);
    expect(places.nearbySearch).not.toHaveBeenCalled();
  });

  it('skips Places calls (and stores nothing) when region centroid is missing', async () => {
    const store: FakeStore = { rows: new Map() };
    const prisma = makePrisma(store, {
      ...REGION,
      latitude: null as never,
      longitude: null as never,
    });
    const places = makePlaces([[placeResult()]]);
    const svc = build(prisma, places);
    await expect(svc.discoverRegion('gsu')).rejects.toThrow(/centroid/i);
    expect(places.nearbySearch).not.toHaveBeenCalled();
  });
});

describe('resolveCategories (BH5 launch preset)', () => {
  it('expands the launch preset to the full food/grocery sweep', () => {
    expect(resolveCategories('launch')).toEqual(CATEGORY_PRESETS.launch);
    expect(CATEGORY_PRESETS.launch).toContain('supermarket');
    expect(CATEGORY_PRESETS.launch).toContain('meal_takeaway');
  });

  it('parses a comma-separated list', () => {
    expect(resolveCategories('restaurant, cafe ,bakery')).toEqual([
      'restaurant',
      'cafe',
      'bakery',
    ]);
  });

  it('returns undefined for empty/missing input (so the safe default is used)', () => {
    expect(resolveCategories(undefined)).toBeUndefined();
    expect(resolveCategories('')).toBeUndefined();
  });
});
