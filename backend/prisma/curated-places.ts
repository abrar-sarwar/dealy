import type { PrismaClient, Prisma } from '@prisma/client';

/**
 * Curated GSU/GT student spots (BH4). These are REAL, well-known places near the
 * two launch campuses, hand-entered as `source='manual'` Place rows so Smart
 * Basket + Food Run have honest, launch-ready inventory BEFORE Google Places
 * discovery / Gemini enrichment runs.
 *
 * Honesty rules:
 * - We do NOT fabricate Google `rating` / `userRatingsTotal` — they stay null.
 * - Coordinates are approximate (campus-area), addresses are real.
 * - Affordability / student-value / cheap-eats scores are CONSERVATIVE editorial
 *   estimates, set just high enough to surface these spots; they are not Google
 *   or Gemini signals.
 * - estimatedMealMin/MaxMinor + priceBucket are honest typical-spend ranges.
 *
 * Idempotent: upserted by a stable synthetic googlePlaceId `manual:<slug>`.
 */

export interface CuratedPlaceSeed {
  slug: string;
  name: string;
  regionSlug: 'gsu' | 'gt';
  /** Real street address (for reference / future geocoding). */
  address: string;
  latitude: number;
  longitude: number;
  priceBucket: '$' | '$$' | '$$$';
  estimatedMealMinMinor: number;
  estimatedMealMaxMinor: number;
  /** chain | local — honest classification. */
  chainClassification: 'chain' | 'local';
  recommendedOrder: string;
  budgetTip: string;
  launchRegionPriority: number;
  affordabilityScore: number;
  studentValueScore: number;
  cheapEatsScore: number;
  lateNight?: boolean;
  studySpot?: boolean;
  vibeTags?: string[];
  categoryTags?: string[];
}

export const CURATED_PLACES: CuratedPlaceSeed[] = [
  // ---- GSU (Downtown Atlanta) ----
  {
    slug: 'rosas-pizza-gsu',
    name: "Rosa's Pizza",
    regionSlug: 'gsu',
    address: '62 Broad St SW, Atlanta, GA 30303',
    latitude: 33.7527,
    longitude: -84.3914,
    priceBucket: '$',
    estimatedMealMinMinor: 400,
    estimatedMealMaxMinor: 900,
    chainClassification: 'local',
    recommendedOrder: 'Two cheese slices and a drink keeps you under $7.',
    budgetTip: 'Slices are the move — grab two and skip the whole pie to stay cheap.',
    launchRegionPriority: 10,
    affordabilityScore: 0.9,
    studentValueScore: 0.85,
    cheapEatsScore: 0.9,
    vibeTags: ['quick', 'cheap'],
    categoryTags: ['pizza'],
  },
  {
    slug: 'naan-stop-gsu',
    name: 'Naan Stop',
    regionSlug: 'gsu',
    address: '16 Broad St NW, Atlanta, GA 30303',
    latitude: 33.7536,
    longitude: -84.3912,
    priceBucket: '$',
    estimatedMealMinMinor: 800,
    estimatedMealMaxMinor: 1200,
    chainClassification: 'local',
    recommendedOrder: 'Build-your-own naan wrap with chicken — filling for around $10.',
    budgetTip: 'The wrap is more food-per-dollar than the bowl; add rice only if you need it.',
    launchRegionPriority: 9,
    affordabilityScore: 0.8,
    studentValueScore: 0.85,
    cheapEatsScore: 0.8,
    vibeTags: ['quick', 'filling'],
    categoryTags: ['indian', 'fast-casual'],
  },
  {
    slug: 'sweet-auburn-curb-market-gsu',
    name: 'Sweet Auburn Curb Market',
    regionSlug: 'gsu',
    address: '209 Edgewood Ave SE, Atlanta, GA 30303',
    latitude: 33.7541,
    longitude: -84.3776,
    priceBucket: '$$',
    estimatedMealMinMinor: 900,
    estimatedMealMaxMinor: 1500,
    chainClassification: 'local',
    recommendedOrder: 'Walk the stalls — Bell Street Burritos or Grindhouse give the best value.',
    budgetTip: 'A food hall, so compare a couple of stalls before you commit; lunch beats dinner pricing.',
    launchRegionPriority: 7,
    affordabilityScore: 0.7,
    studentValueScore: 0.75,
    cheapEatsScore: 0.7,
    vibeTags: ['social', 'variety'],
    categoryTags: ['food-hall'],
  },
  {
    slug: 'slutty-vegan-edgewood-gsu',
    name: 'Slutty Vegan (Edgewood)',
    regionSlug: 'gsu',
    address: '477 Edgewood Ave SE, Atlanta, GA 30312',
    latitude: 33.7547,
    longitude: -84.3727,
    priceBucket: '$$',
    estimatedMealMinMinor: 1200,
    estimatedMealMaxMinor: 1800,
    chainClassification: 'local',
    recommendedOrder: 'One Shorty burger is plenty — split fries with a friend.',
    budgetTip: 'Go off-peak to skip the line; one burger fills you up, no need for combos.',
    launchRegionPriority: 6,
    affordabilityScore: 0.55,
    studentValueScore: 0.65,
    cheapEatsScore: 0.5,
    vibeTags: ['social', 'comfort'],
    categoryTags: ['vegan', 'burgers'],
  },
  {
    slug: 'waffle-house-downtown-gsu',
    name: 'Waffle House (Downtown)',
    regionSlug: 'gsu',
    address: '210 Peachtree St NW, Atlanta, GA 30303',
    latitude: 33.7591,
    longitude: -84.3877,
    priceBucket: '$',
    estimatedMealMinMinor: 700,
    estimatedMealMaxMinor: 1200,
    chainClassification: 'chain',
    recommendedOrder: 'All-Star Special if hungry; otherwise hashbrowns + eggs is the cheap classic.',
    budgetTip: 'Open 24/7 — the late-night value play. Cash tips, card the meal.',
    launchRegionPriority: 5,
    affordabilityScore: 0.85,
    studentValueScore: 0.8,
    cheapEatsScore: 0.85,
    lateNight: true,
    vibeTags: ['comfort', 'late'],
    categoryTags: ['diner', 'breakfast'],
  },
  // ---- GT (Midtown / Home Park / Tech Square) ----
  {
    slug: 'the-varsity-gt',
    name: 'The Varsity',
    regionSlug: 'gt',
    address: '61 North Ave NW, Atlanta, GA 30308',
    latitude: 33.7714,
    longitude: -84.3886,
    priceBucket: '$',
    estimatedMealMinMinor: 700,
    estimatedMealMaxMinor: 1300,
    chainClassification: 'local',
    recommendedOrder: 'Two chili dogs and a Frosted Orange — the classic GT run.',
    budgetTip: 'Order à la carte instead of the combo; the dogs are cheap on their own.',
    launchRegionPriority: 10,
    affordabilityScore: 0.85,
    studentValueScore: 0.8,
    cheapEatsScore: 0.85,
    vibeTags: ['quick', 'comfort'],
    categoryTags: ['burgers', 'hot-dogs'],
  },
  {
    slug: 'tin-drum-tech-square-gt',
    name: 'Tin Drum Asian Kitchen (Tech Square)',
    regionSlug: 'gt',
    address: '595 Spring St NW, Atlanta, GA 30308',
    latitude: 33.7766,
    longitude: -84.3892,
    priceBucket: '$',
    estimatedMealMinMinor: 900,
    estimatedMealMaxMinor: 1300,
    chainClassification: 'chain',
    recommendedOrder: 'Drunken noodles or pad thai with tofu — solid portion around $11.',
    budgetTip: 'Lunch portions are big enough to stretch into two meals; skip the bubble tea to save.',
    launchRegionPriority: 9,
    affordabilityScore: 0.75,
    studentValueScore: 0.8,
    cheapEatsScore: 0.75,
    studySpot: true,
    vibeTags: ['quick', 'study'],
    categoryTags: ['asian', 'fast-casual'],
  },
  {
    slug: 'sublime-doughnuts-gt',
    name: 'Sublime Doughnuts',
    regionSlug: 'gt',
    address: '535 10th St NW, Atlanta, GA 30318',
    latitude: 33.7818,
    longitude: -84.4045,
    priceBucket: '$',
    estimatedMealMinMinor: 300,
    estimatedMealMaxMinor: 800,
    chainClassification: 'local',
    recommendedOrder: 'A couple of specialty doughnuts and a coffee for a cheap study break.',
    budgetTip: 'Go early for the full case; day-old availability is hit or miss.',
    launchRegionPriority: 7,
    affordabilityScore: 0.85,
    studentValueScore: 0.75,
    cheapEatsScore: 0.85,
    studySpot: true,
    vibeTags: ['coffee', 'study', 'dessert'],
    categoryTags: ['bakery', 'cafe', 'dessert'],
  },
  {
    slug: 'antico-pizza-gt',
    name: 'Antico Pizza Napoletana',
    regionSlug: 'gt',
    address: '1093 Hemphill Ave NW, Atlanta, GA 30318',
    latitude: 33.7864,
    longitude: -84.4117,
    priceBucket: '$$',
    estimatedMealMinMinor: 1500,
    estimatedMealMaxMinor: 2200,
    chainClassification: 'local',
    recommendedOrder: 'Split a pizza between two — one pie easily feeds two students.',
    budgetTip: 'Best value when shared; a single pie split is cheaper per person than going solo.',
    launchRegionPriority: 6,
    affordabilityScore: 0.5,
    studentValueScore: 0.6,
    cheapEatsScore: 0.45,
    vibeTags: ['social', 'filling'],
    categoryTags: ['pizza', 'italian'],
  },
  {
    slug: 'rocky-mountain-pizza-gt',
    name: 'Rocky Mountain Pizza Company',
    regionSlug: 'gt',
    address: '811 Marietta St NW, Atlanta, GA 30318',
    latitude: 33.7796,
    longitude: -84.4079,
    priceBucket: '$',
    estimatedMealMinMinor: 500,
    estimatedMealMaxMinor: 1000,
    chainClassification: 'local',
    recommendedOrder: 'Jumbo slice special — one slice is basically a meal.',
    budgetTip: 'The jumbo slice deal is the cheapest way to get full near campus.',
    launchRegionPriority: 8,
    affordabilityScore: 0.85,
    studentValueScore: 0.8,
    cheapEatsScore: 0.85,
    lateNight: true,
    vibeTags: ['quick', 'cheap', 'late'],
    categoryTags: ['pizza'],
  },
];

/** Upsert all curated places idempotently (called from seed.ts). */
export async function seedCuratedPlaces(prisma: PrismaClient): Promise<number> {
  for (const p of CURATED_PLACES) {
    const googlePlaceId = `manual:${p.slug}`;
    const base = {
      googlePlaceId,
      name: p.name,
      categorySlug: 'food',
      googleTypes: [],
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      regionSlug: p.regionSlug,
      campusSlug: p.regionSlug,
      campusAffinity: p.regionSlug,
      source: 'manual',
      manualReviewStatus: 'approved',
      curatedStudentFriendly: true,
      priceBucket: p.priceBucket,
      estimatedMealMinMinor: p.estimatedMealMinMinor,
      estimatedMealMaxMinor: p.estimatedMealMaxMinor,
      chainClassification: p.chainClassification,
      recommendedOrder: p.recommendedOrder,
      budgetTip: p.budgetTip,
      launchRegionPriority: p.launchRegionPriority,
      affordabilityScore: p.affordabilityScore,
      studentValueScore: p.studentValueScore,
      cheapEatsScore: p.cheapEatsScore,
      lateNight: p.lateNight ?? null,
      studySpot: p.studySpot ?? null,
      vibeTags: p.vibeTags ?? [],
      categoryTags: p.categoryTags ?? [],
      // Honesty: never fabricate Google signals.
      rating: null,
      userRatingsTotal: null,
    } satisfies Prisma.PlaceUncheckedCreateInput;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { googlePlaceId: _gid, ...update } = base;
    await prisma.place.upsert({
      where: { googlePlaceId },
      update,
      create: base,
    });
  }
  return CURATED_PLACES.length;
}
