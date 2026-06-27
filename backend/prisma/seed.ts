import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Categories mirror the iOS `DealCategory` rawValues so the app maps 1:1.
const categories = [
  { slug: 'food', displayName: 'Food', symbol: 'fork.knife', sortOrder: 0 },
  { slug: 'groceries', displayName: 'Groceries', symbol: 'cart.fill', sortOrder: 1 },
  { slug: 'tech', displayName: 'Tech', symbol: 'laptopcomputer', sortOrder: 2 },
  { slug: 'studentSupplies', displayName: 'Student Supplies', symbol: 'backpack.fill', sortOrder: 3 },
  { slug: 'clothing', displayName: 'Clothing', symbol: 'tshirt.fill', sortOrder: 4 },
  { slug: 'entertainment', displayName: 'Entertainment', symbol: 'ticket.fill', sortOrder: 5 },
  { slug: 'beauty', displayName: 'Beauty', symbol: 'sparkles', sortOrder: 6 },
  { slug: 'automotive', displayName: 'Automotive', symbol: 'car.fill', sortOrder: 7 },
  { slug: 'home', displayName: 'Home', symbol: 'house.fill', sortOrder: 8 },
  { slug: 'books', displayName: 'Books', symbol: 'book.fill', sortOrder: 9 },
];

const schools = [
  { slug: 'gsu', name: 'Georgia State University', shortName: 'Georgia State' },
  { slug: 'gt', name: 'Georgia Institute of Technology', shortName: 'Georgia Tech' },
  { slug: 'ksu', name: 'Kennesaw State University', shortName: 'Kennesaw State' },
  { slug: 'uga', name: 'University of Georgia', shortName: 'UGA' },
];

const campuses = [
  { slug: 'gsu', schoolSlug: 'gsu', name: 'Georgia State University', shortName: 'Georgia State', cityContext: 'Downtown Atlanta', latitude: 33.7531, longitude: -84.3857, defaultRadius: 3, locationTags: ['atlanta', 'downtown', 'gsu'] },
  { slug: 'gt', schoolSlug: 'gt', name: 'Georgia Tech', shortName: 'Georgia Tech', cityContext: 'Midtown Atlanta', latitude: 33.7756, longitude: -84.3963, defaultRadius: 3, locationTags: ['atlanta', 'midtown', 'gt'] },
  { slug: 'ksu', schoolSlug: 'ksu', name: 'Kennesaw State University', shortName: 'Kennesaw State', cityContext: 'Kennesaw', latitude: 34.039, longitude: -84.5816, defaultRadius: 6, locationTags: ['kennesaw', 'cobb', 'ksu'] },
  { slug: 'uga', schoolSlug: 'uga', name: 'University of Georgia', shortName: 'UGA', cityContext: 'Athens', latitude: 33.948, longitude: -83.3773, defaultRadius: 6, locationTags: ['athens', 'uga'] },
  { slug: 'atlanta', schoolSlug: null, name: 'Metro Atlanta', shortName: 'Atlanta', cityContext: 'Metro Atlanta', latitude: 33.749, longitude: -84.388, defaultRadius: 15, locationTags: ['atlanta', 'metro'] },
];

// Real curated sources for the cost-efficient discovery engine. Seeded DISABLED:
// the operator verifies each URL is live, crawlable, and permitted before
// enabling. `zoneSlug` is the region bucket. CRAWL TARGET RULES:
//   - If the seeded `url` is itself a deal page (its path already matches an
//     allowed target path), leave `targetPaths: []` — the resolver crawls the
//     seeded URL as-is.
//   - If the seeded `url` is a homepage, set `dealUrl` to the verified deals
//     page (preferred) OR `targetPaths` so the resolver builds origin+path.
//     Operators MUST confirm a homepage source's dealUrl before enabling it.
// reliabilityScore seeds at 50 and is updated by the runner from outcomes.
export const crawlSources = [
  // Grocery — weekly ads / coupons (groceries). Seeded URLs are already deal pages.
  { url: 'https://www.publix.com/savings/weekly-ad', sourceType: 'weekly_ad', kind: 'grocery_circular' as const, merchantHint: 'Publix', defaultCategorySlug: 'groceries', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  { url: 'https://www.kroger.com/weeklyad', sourceType: 'weekly_ad', kind: 'grocery_circular' as const, merchantHint: 'Kroger', defaultCategorySlug: 'groceries', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  { url: 'https://www.kroger.com/coupons', sourceType: 'coupon_page', kind: 'grocery_circular' as const, merchantHint: 'Kroger', defaultCategorySlug: 'groceries', zoneSlug: 'midtown', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  { url: 'https://www.aldi.us/weekly-specials/', sourceType: 'weekly_ad', kind: 'grocery_circular' as const, merchantHint: 'Aldi', defaultCategorySlug: 'groceries', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 168, enabled: true },
  { url: 'https://www.foodcity.com/coupons/', sourceType: 'coupon_page', kind: 'grocery_circular' as const, merchantHint: 'Food City', defaultCategorySlug: 'groceries', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  { url: 'https://www.foodcity.com/weekly-ad/', sourceType: 'weekly_ad', kind: 'grocery_circular' as const, merchantHint: 'Food City', defaultCategorySlug: 'groceries', zoneSlug: 'cartersville', dealUrl: null, targetPaths: [], crawlIntervalHours: 168 },
  // Walmart homepage-ish — needs a targeted path (operator should confirm dealUrl).
  { url: 'https://www.walmart.com/', sourceType: 'merchant_site', kind: 'grocery_circular' as const, merchantHint: 'Walmart', defaultCategorySlug: 'groceries', zoneSlug: 'cartersville', dealUrl: null, targetPaths: ['/deals', '/offers'], crawlIntervalHours: 168 },
  // Student platforms — homepages; targetPaths build the deal path (confirm dealUrl before enabling).
  { url: 'https://www.studentbeans.com/us', sourceType: 'student_platform', kind: 'student_discount' as const, merchantHint: 'Student Beans', defaultCategorySlug: 'studentSupplies', zoneSlug: 'gsu', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  { url: 'https://www.myunidays.com/US/en-US', sourceType: 'student_platform', kind: 'student_discount' as const, merchantHint: 'UNiDAYS', defaultCategorySlug: 'studentSupplies', zoneSlug: 'gt', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  // Campus dining — GSU/GT seeded URLs already point at /specials/ (targetPaths: []);
  // KSU/UGA are homepages needing targetPaths to build the deal path.
  { url: 'https://dining.gsu.edu/specials/', sourceType: 'merchant_site', kind: 'student_discount' as const, merchantHint: 'Georgia State Dining', defaultCategorySlug: 'food', zoneSlug: 'gsu', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://techdining.gatech.edu/specials/', sourceType: 'merchant_site', kind: 'student_discount' as const, merchantHint: 'Georgia Tech Dining', defaultCategorySlug: 'food', zoneSlug: 'gt', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://dining.kennesaw.edu/', sourceType: 'merchant_site', kind: 'student_discount' as const, merchantHint: 'KSU Dining', defaultCategorySlug: 'food', zoneSlug: 'ksu', dealUrl: null, targetPaths: ['/specials', '/deals'], crawlIntervalHours: 72 },
  { url: 'https://dining.uga.edu/', sourceType: 'merchant_site', kind: 'student_discount' as const, merchantHint: 'UGA Dining', defaultCategorySlug: 'food', zoneSlug: 'uga', dealUrl: null, targetPaths: ['/specials'], crawlIntervalHours: 72 },
  // Campus student-newspaper / perk sources — seeded DISABLED.
  // NOTE: needs a verified article dealUrl before enabling; content lives in articles.
  // targetPaths: ['/student-discounts'] ensures resolveCrawlTargets returns a non-bare URL.
  { url: 'https://www.ksusentinel.com/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'KSU Sentinel', defaultCategorySlug: 'studentSupplies', zoneSlug: 'ksu', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  { url: 'https://studentcenter.gsu.edu/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'GSU Student Center', defaultCategorySlug: 'studentSupplies', zoneSlug: 'gsu', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  { url: 'https://nique.net/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'GT Nique', defaultCategorySlug: 'studentSupplies', zoneSlug: 'gt', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  { url: 'https://www.redandblack.com/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'UGA Red & Black', defaultCategorySlug: 'studentSupplies', zoneSlug: 'uga', dealUrl: null, targetPaths: ['/student-discounts'], crawlIntervalHours: 72 },
  // Restaurants / local promos — seeded URLs already point at /restaurants, /deals, /events.
  { url: 'https://poncecitymarket.com/restaurants/', sourceType: 'merchant_site', kind: 'happy_hour' as const, merchantHint: 'Ponce City Market', defaultCategorySlug: 'food', zoneSlug: 'midtown', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://buckhead.com/explore/deals/', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: 'Buckhead ATL', defaultCategorySlug: 'entertainment', zoneSlug: 'buckhead', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://discoveratlanta.com/things-to-do/deals/', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: 'Discover Atlanta', defaultCategorySlug: 'entertainment', zoneSlug: 'downtown', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://beltline.org/events/', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: 'Atlanta BeltLine', defaultCategorySlug: 'entertainment', zoneSlug: 'midtown', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  // Balanced pilot additions — real public deal/specials pages with already-targeted
  // paths. Seeded disabled (like all sources); an operator verifies each is live and
  // Firecrawl-crawlable before enabling. A curl-403 at seed time does NOT mean Firecrawl
  // cannot crawl (it uses rotating proxies) — see the discovery runbook for status.
  // Restaurants / food specials
  { url: 'https://www.chilis.com/specials', sourceType: 'merchant_site', kind: 'restaurant' as const, merchantHint: "Chili's", defaultCategorySlug: 'food', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 72, enabled: true },
  { url: 'https://www.applebees.com/en/specials', sourceType: 'merchant_site', kind: 'restaurant' as const, merchantHint: "Applebee's", defaultCategorySlug: 'food', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 72, enabled: true },
  // Entertainment
  { url: 'https://www.foxtheatre.org/events', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: 'Fox Theatre', defaultCategorySlug: 'entertainment', zoneSlug: 'downtown', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://www.regmovies.com/movies/promotions', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: 'Regal Cinemas', defaultCategorySlug: 'entertainment', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  // Beauty / fitness / services
  { url: 'https://www.massageenvy.com/offers', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: 'Massage Envy', defaultCategorySlug: 'beauty', zoneSlug: 'buckhead', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://www.greatclips.com/offers', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: 'Great Clips', defaultCategorySlug: 'beauty', zoneSlug: 'atlanta', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  // Retail / supplies
  { url: 'https://www.macys.com/shop/deals', sourceType: 'merchant_site', kind: 'local_promo' as const, merchantHint: "Macy's", defaultCategorySlug: 'clothing', zoneSlug: 'buckhead', dealUrl: null, targetPaths: [], crawlIntervalHours: 72 },
  // Campus student-discount LIST pages — verified public pages (HTTP 200) that explicitly
  // list current student discounts (see docs/campus-source-intel.md). dealUrl = the page so
  // resolveCrawlTargets keeps the deep link. Seeded DISABLED until a trial discovery run
  // proves Gemini extracts ≥1 concrete offer. Eligibility (student vs faculty/staff/alumni)
  // is set per-offer by extraction → requiresStudentId, NOT assumed here.
  { url: 'https://engagement.gsu.edu/student-center/foodandretail/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'GSU Student Center', defaultCategorySlug: 'entertainment', zoneSlug: 'gsu', dealUrl: 'https://engagement.gsu.edu/student-center/foodandretail/', targetPaths: [], crawlIntervalHours: 72, enabled: true },
  { url: 'https://www.buzzcard.gatech.edu/offers-from-our-merchants/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'GT BuzzCard', defaultCategorySlug: 'food', zoneSlug: 'gt', dealUrl: 'https://www.buzzcard.gatech.edu/offers-from-our-merchants/', targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://benefits.hr.gatech.edu/perks-and-programs/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'GT Perks & Programs', defaultCategorySlug: 'studentSupplies', zoneSlug: 'gt', dealUrl: 'https://benefits.hr.gatech.edu/perks-and-programs/', targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://campus.kennesaw.edu/faculty-staff/human-resources/resources/employees/perks-discounts.php', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'KSU Perks & Discounts', defaultCategorySlug: 'food', zoneSlug: 'ksu', dealUrl: 'https://campus.kennesaw.edu/faculty-staff/human-resources/resources/employees/perks-discounts.php', targetPaths: [], crawlIntervalHours: 72 },
  { url: 'https://alumni.uga.edu/benefits/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'UGA Benefits', defaultCategorySlug: 'studentSupplies', zoneSlug: 'uga', dealUrl: 'https://alumni.uga.edu/benefits/', targetPaths: [], crawlIntervalHours: 72, enabled: true },
  { url: 'https://pac.uga.edu/discounts/', sourceType: 'student_platform' as const, kind: 'student_discount' as const, merchantHint: 'UGA Performing Arts Center', defaultCategorySlug: 'entertainment', zoneSlug: 'uga', dealUrl: 'https://pac.uga.edu/discounts/', targetPaths: [], crawlIntervalHours: 72, enabled: true },
];

async function seedCrawlSources(): Promise<void> {
  for (const s of crawlSources) {
    await prisma.crawlSource.upsert({
      where: { url: s.url },
      // Update curatable metadata only — never silently re-enable a source the
      // operator turned on/off, and never reset reliability/bookkeeping.
      update: {
        kind: s.kind,
        sourceType: s.sourceType,
        merchantHint: s.merchantHint,
        defaultCategorySlug: s.defaultCategorySlug,
        zoneSlug: s.zoneSlug,
        dealUrl: s.dealUrl,
        targetPaths: s.targetPaths,
        crawlIntervalHours: s.crawlIntervalHours,
      },
      create: {
        url: s.url,
        kind: s.kind,
        sourceType: s.sourceType,
        merchantHint: s.merchantHint,
        defaultCategorySlug: s.defaultCategorySlug,
        zoneSlug: s.zoneSlug,
        dealUrl: s.dealUrl,
        targetPaths: s.targetPaths,
        crawlIntervalHours: s.crawlIntervalHours,
        // Disabled by default — operator verifies the URL, then flips this on. A
        // source may opt into enabled-on-seed only after it's been verified to yield
        // (see the GSU/UGA campus sources, trial-verified in docs/campus-source-intel.md).
        enabled: 'enabled' in s ? (s as { enabled?: boolean }).enabled ?? false : false,
      },
    });
  }
}

// Regional inventory buckets for the pilot zones. Discovery promotion looks up a
// region by slug (and returns nothing if the row is missing), and the runner uses
// the centroid (latitude/longitude) as coordinates for promoted deals so they
// surface in the geographic local feed. radiusMiles mirrors each zone's reach.
export const regionalInventories = [
  { regionSlug: 'atlanta', regionName: 'Metro Atlanta', regionType: 'metro', latitude: 33.749, longitude: -84.388, radiusMiles: 15 },
  { regionSlug: 'midtown', regionName: 'Midtown Atlanta', regionType: 'district', latitude: 33.7838, longitude: -84.3836, radiusMiles: 3 },
  { regionSlug: 'buckhead', regionName: 'Buckhead', regionType: 'district', latitude: 33.8487, longitude: -84.3733, radiusMiles: 3 },
  { regionSlug: 'downtown', regionName: 'Downtown Atlanta', regionType: 'district', latitude: 33.7556, longitude: -84.39, radiusMiles: 3 },
  { regionSlug: 'gsu', regionName: 'Georgia State University', regionType: 'campus', latitude: 33.7531, longitude: -84.3857, radiusMiles: 3 },
  { regionSlug: 'gt', regionName: 'Georgia Tech', regionType: 'campus', latitude: 33.7756, longitude: -84.3963, radiusMiles: 3 },
  { regionSlug: 'ksu', regionName: 'Kennesaw State University', regionType: 'campus', latitude: 34.039, longitude: -84.5816, radiusMiles: 6 },
  { regionSlug: 'uga', regionName: 'University of Georgia', regionType: 'campus', latitude: 33.948, longitude: -83.3773, radiusMiles: 6 },
  { regionSlug: 'cartersville', regionName: 'Cartersville', regionType: 'city', latitude: 34.1651, longitude: -84.7999, radiusMiles: 6 },
];

async function seedRegionalInventories(): Promise<void> {
  for (const r of regionalInventories) {
    await prisma.regionalInventory.upsert({
      where: { regionSlug: r.regionSlug },
      // Refresh static descriptors only — never reset runtime health/refresh state.
      update: {
        regionName: r.regionName,
        regionType: r.regionType,
        latitude: r.latitude,
        longitude: r.longitude,
        radiusMiles: r.radiusMiles,
      },
      create: r,
    });
  }
}

async function main(): Promise<void> {
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { displayName: c.displayName, symbol: c.symbol, sortOrder: c.sortOrder },
      create: c,
    });
  }

  for (const s of schools) {
    await prisma.school.upsert({
      where: { slug: s.slug },
      update: { name: s.name, shortName: s.shortName },
      create: s,
    });
  }

  for (const c of campuses) {
    const school = c.schoolSlug
      ? await prisma.school.findUnique({ where: { slug: c.schoolSlug } })
      : null;
    const { schoolSlug: _schoolSlug, ...data } = c;
    await prisma.campus.upsert({
      where: { slug: c.slug },
      update: { ...data, schoolId: school?.id ?? null },
      create: { ...data, schoolId: school?.id ?? null },
    });
  }

  await seedDeals();
  await seedCrawlSources();
  await seedRegionalInventories();
  await seedGroceryStaples();

  const [cat, sch, cam, deal, crawl, region, staple] = await Promise.all([
    prisma.category.count(),
    prisma.school.count(),
    prisma.campus.count(),
    prisma.deal.count(),
    prisma.crawlSource.count(),
    prisma.regionalInventory.count(),
    prisma.groceryStapleItem.count(),
  ]);
  // eslint-disable-next-line no-console
  console.log(
    `Seeded: ${cat} categories, ${sch} schools, ${cam} campuses, ${deal} deals, ${crawl} crawl sources, ${region} regions, ${staple} staples`,
  );
}

// Smart Basket staples catalog — honest national price estimates (minor units),
// NOT real deals. dietaryTags use the wire dietary enum; goalAffinities use the
// wire goal enum; prepLevel ∈ no_cook | low | medium | high. Idempotent by slug.
interface StapleSeed {
  slug: string;
  name: string;
  category: string;
  unit: string;
  defaultQuantity: number;
  estimatedPriceMinor: number;
  dietaryTags: string[];
  goalAffinities: string[];
  prepLevel: string;
}

const groceryStaples: StapleSeed[] = [
  // Produce
  { slug: 'bananas', name: 'Bananas', category: 'produce', unit: 'bunch', defaultQuantity: 1, estimatedPriceMinor: 159, dietaryTags: ['vegetarian', 'halal', 'healthy', 'no_cooking'], goalAffinities: ['cheapest', 'breakfast', 'healthy', 'dorm_snacks'], prepLevel: 'no_cook' },
  { slug: 'apples', name: 'Apples (bag)', category: 'produce', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 399, dietaryTags: ['vegetarian', 'halal', 'healthy', 'no_cooking'], goalAffinities: ['healthy', 'dorm_snacks', 'cheapest'], prepLevel: 'no_cook' },
  { slug: 'baby-carrots', name: 'Baby carrots', category: 'produce', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 199, dietaryTags: ['vegetarian', 'halal', 'healthy', 'no_cooking', 'low_prep'], goalAffinities: ['healthy', 'quick_meals', 'dorm_snacks'], prepLevel: 'no_cook' },
  { slug: 'spinach', name: 'Spinach (bag)', category: 'produce', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 279, dietaryTags: ['vegetarian', 'halal', 'healthy'], goalAffinities: ['healthy', 'meal_prep', 'high_protein'], prepLevel: 'low' },
  { slug: 'broccoli', name: 'Broccoli', category: 'produce', unit: 'head', defaultQuantity: 1, estimatedPriceMinor: 199, dietaryTags: ['vegetarian', 'halal', 'healthy'], goalAffinities: ['healthy', 'meal_prep'], prepLevel: 'low' },
  { slug: 'onions', name: 'Onions (bag)', category: 'produce', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 249, dietaryTags: ['vegetarian', 'halal', 'healthy'], goalAffinities: ['meal_prep', 'cheapest'], prepLevel: 'low' },
  { slug: 'potatoes', name: 'Potatoes (5 lb)', category: 'produce', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 399, dietaryTags: ['vegetarian', 'halal', 'bulk_value'], goalAffinities: ['cheapest', 'meal_prep', 'bulk_value'], prepLevel: 'medium' },
  { slug: 'tomatoes', name: 'Roma tomatoes', category: 'produce', unit: 'lb', defaultQuantity: 1, estimatedPriceMinor: 179, dietaryTags: ['vegetarian', 'halal', 'healthy', 'no_cooking'], goalAffinities: ['healthy', 'meal_prep'], prepLevel: 'no_cook' },

  // Protein
  { slug: 'eggs', name: 'Eggs (dozen)', category: 'protein', unit: 'dozen', defaultQuantity: 1, estimatedPriceMinor: 249, dietaryTags: ['vegetarian', 'halal', 'high_protein'], goalAffinities: ['high_protein', 'breakfast', 'cheapest', 'meal_prep'], prepLevel: 'low' },
  { slug: 'chicken-thighs', name: 'Chicken thighs', category: 'protein', unit: 'lb', defaultQuantity: 2, estimatedPriceMinor: 349, dietaryTags: ['halal', 'high_protein'], goalAffinities: ['high_protein', 'meal_prep', 'cheapest'], prepLevel: 'medium' },
  { slug: 'chicken-breast', name: 'Chicken breast', category: 'protein', unit: 'lb', defaultQuantity: 1, estimatedPriceMinor: 399, dietaryTags: ['halal', 'high_protein', 'healthy'], goalAffinities: ['high_protein', 'meal_prep', 'healthy'], prepLevel: 'medium' },
  { slug: 'ground-beef', name: 'Ground beef (1 lb)', category: 'protein', unit: 'lb', defaultQuantity: 1, estimatedPriceMinor: 549, dietaryTags: ['halal', 'high_protein'], goalAffinities: ['high_protein', 'meal_prep'], prepLevel: 'medium' },
  { slug: 'canned-tuna', name: 'Canned tuna', category: 'protein', unit: 'can', defaultQuantity: 2, estimatedPriceMinor: 99, dietaryTags: ['halal', 'high_protein', 'no_cooking', 'low_prep'], goalAffinities: ['high_protein', 'quick_meals', 'cheapest'], prepLevel: 'no_cook' },
  { slug: 'black-beans', name: 'Black beans (can)', category: 'protein', unit: 'can', defaultQuantity: 2, estimatedPriceMinor: 109, dietaryTags: ['vegetarian', 'halal', 'high_protein', 'bulk_value'], goalAffinities: ['cheapest', 'high_protein', 'meal_prep'], prepLevel: 'low' },
  { slug: 'peanut-butter', name: 'Peanut butter', category: 'protein', unit: 'jar', defaultQuantity: 1, estimatedPriceMinor: 299, dietaryTags: ['vegetarian', 'halal', 'high_protein', 'no_cooking'], goalAffinities: ['high_protein', 'breakfast', 'cheapest', 'dorm_snacks'], prepLevel: 'no_cook' },
  { slug: 'tofu', name: 'Tofu', category: 'protein', unit: 'block', defaultQuantity: 1, estimatedPriceMinor: 199, dietaryTags: ['vegetarian', 'halal', 'high_protein', 'healthy'], goalAffinities: ['high_protein', 'healthy', 'meal_prep'], prepLevel: 'low' },

  // Dairy
  { slug: 'milk', name: 'Milk (gallon)', category: 'dairy', unit: 'gallon', defaultQuantity: 1, estimatedPriceMinor: 379, dietaryTags: ['vegetarian', 'halal', 'high_protein'], goalAffinities: ['breakfast', 'cheapest', 'high_protein'], prepLevel: 'no_cook' },
  { slug: 'greek-yogurt', name: 'Greek yogurt (tub)', category: 'dairy', unit: 'tub', defaultQuantity: 1, estimatedPriceMinor: 449, dietaryTags: ['vegetarian', 'halal', 'high_protein', 'healthy', 'no_cooking'], goalAffinities: ['high_protein', 'breakfast', 'healthy'], prepLevel: 'no_cook' },
  { slug: 'cheddar-cheese', name: 'Cheddar cheese (block)', category: 'dairy', unit: 'block', defaultQuantity: 1, estimatedPriceMinor: 399, dietaryTags: ['vegetarian', 'halal', 'high_protein'], goalAffinities: ['meal_prep', 'high_protein'], prepLevel: 'no_cook' },
  { slug: 'butter', name: 'Butter', category: 'dairy', unit: 'pack', defaultQuantity: 1, estimatedPriceMinor: 449, dietaryTags: ['vegetarian', 'halal'], goalAffinities: ['breakfast', 'meal_prep'], prepLevel: 'no_cook' },
  { slug: 'string-cheese', name: 'String cheese', category: 'dairy', unit: 'pack', defaultQuantity: 1, estimatedPriceMinor: 399, dietaryTags: ['vegetarian', 'halal', 'high_protein', 'no_cooking', 'snacks_drinks'], goalAffinities: ['dorm_snacks', 'high_protein', 'quick_meals'], prepLevel: 'no_cook' },

  // Grains
  { slug: 'white-rice', name: 'White rice (5 lb)', category: 'grains', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 549, dietaryTags: ['vegetarian', 'halal', 'bulk_value'], goalAffinities: ['cheapest', 'meal_prep', 'bulk_value'], prepLevel: 'low' },
  { slug: 'pasta', name: 'Pasta (box)', category: 'grains', unit: 'box', defaultQuantity: 2, estimatedPriceMinor: 119, dietaryTags: ['vegetarian', 'halal', 'bulk_value'], goalAffinities: ['cheapest', 'meal_prep', 'quick_meals'], prepLevel: 'low' },
  { slug: 'bread', name: 'Bread (loaf)', category: 'grains', unit: 'loaf', defaultQuantity: 1, estimatedPriceMinor: 229, dietaryTags: ['vegetarian', 'halal'], goalAffinities: ['breakfast', 'cheapest', 'quick_meals'], prepLevel: 'no_cook' },
  { slug: 'oatmeal', name: 'Oatmeal (canister)', category: 'grains', unit: 'canister', defaultQuantity: 1, estimatedPriceMinor: 349, dietaryTags: ['vegetarian', 'halal', 'healthy', 'bulk_value'], goalAffinities: ['breakfast', 'healthy', 'cheapest'], prepLevel: 'low' },
  { slug: 'tortillas', name: 'Tortillas', category: 'grains', unit: 'pack', defaultQuantity: 1, estimatedPriceMinor: 269, dietaryTags: ['vegetarian', 'halal'], goalAffinities: ['quick_meals', 'cheapest', 'meal_prep'], prepLevel: 'no_cook' },
  { slug: 'cereal', name: 'Cereal (box)', category: 'grains', unit: 'box', defaultQuantity: 1, estimatedPriceMinor: 349, dietaryTags: ['vegetarian', 'halal', 'no_cooking'], goalAffinities: ['breakfast', 'dorm_snacks'], prepLevel: 'no_cook' },
  { slug: 'ramen', name: 'Ramen (pack)', category: 'grains', unit: 'pack', defaultQuantity: 1, estimatedPriceMinor: 299, dietaryTags: ['vegetarian', 'bulk_value', 'low_prep'], goalAffinities: ['cheapest', 'quick_meals', 'dorm_snacks'], prepLevel: 'low' },

  // Frozen
  { slug: 'frozen-vegetables', name: 'Frozen mixed vegetables', category: 'frozen', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 199, dietaryTags: ['vegetarian', 'halal', 'healthy', 'low_prep'], goalAffinities: ['healthy', 'meal_prep', 'cheapest'], prepLevel: 'low' },
  { slug: 'frozen-chicken-nuggets', name: 'Frozen chicken nuggets', category: 'frozen', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 599, dietaryTags: ['halal', 'high_protein', 'low_prep'], goalAffinities: ['quick_meals', 'dorm_snacks', 'high_protein'], prepLevel: 'low' },
  { slug: 'frozen-pizza', name: 'Frozen pizza', category: 'frozen', unit: 'each', defaultQuantity: 1, estimatedPriceMinor: 399, dietaryTags: ['vegetarian', 'low_prep'], goalAffinities: ['quick_meals', 'dorm_snacks', 'party'], prepLevel: 'low' },
  { slug: 'frozen-berries', name: 'Frozen berries', category: 'frozen', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 399, dietaryTags: ['vegetarian', 'halal', 'healthy', 'no_cooking'], goalAffinities: ['breakfast', 'healthy'], prepLevel: 'no_cook' },
  { slug: 'frozen-burritos', name: 'Frozen burritos', category: 'frozen', unit: 'pack', defaultQuantity: 1, estimatedPriceMinor: 499, dietaryTags: ['low_prep'], goalAffinities: ['quick_meals', 'dorm_snacks', 'cheapest'], prepLevel: 'low' },

  // Pantry
  { slug: 'olive-oil', name: 'Olive oil', category: 'pantry', unit: 'bottle', defaultQuantity: 1, estimatedPriceMinor: 599, dietaryTags: ['vegetarian', 'halal', 'healthy'], goalAffinities: ['meal_prep', 'healthy'], prepLevel: 'no_cook' },
  { slug: 'pasta-sauce', name: 'Pasta sauce', category: 'pantry', unit: 'jar', defaultQuantity: 1, estimatedPriceMinor: 199, dietaryTags: ['vegetarian', 'halal'], goalAffinities: ['quick_meals', 'meal_prep', 'cheapest'], prepLevel: 'no_cook' },
  { slug: 'canned-soup', name: 'Canned soup', category: 'pantry', unit: 'can', defaultQuantity: 2, estimatedPriceMinor: 149, dietaryTags: ['vegetarian', 'low_prep', 'no_cooking'], goalAffinities: ['quick_meals', 'cheapest', 'dorm_snacks'], prepLevel: 'low' },
  { slug: 'mac-and-cheese', name: 'Mac & cheese (box)', category: 'pantry', unit: 'box', defaultQuantity: 2, estimatedPriceMinor: 109, dietaryTags: ['vegetarian', 'low_prep'], goalAffinities: ['cheapest', 'quick_meals', 'dorm_snacks'], prepLevel: 'low' },
  { slug: 'honey', name: 'Honey', category: 'pantry', unit: 'bottle', defaultQuantity: 1, estimatedPriceMinor: 449, dietaryTags: ['vegetarian', 'halal', 'no_cooking'], goalAffinities: ['breakfast', 'healthy'], prepLevel: 'no_cook' },
  { slug: 'hot-sauce', name: 'Hot sauce', category: 'pantry', unit: 'bottle', defaultQuantity: 1, estimatedPriceMinor: 199, dietaryTags: ['vegetarian', 'halal', 'no_cooking'], goalAffinities: ['meal_prep', 'party'], prepLevel: 'no_cook' },

  // Snacks
  { slug: 'tortilla-chips', name: 'Tortilla chips', category: 'snacks', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 299, dietaryTags: ['vegetarian', 'halal', 'no_cooking', 'snacks_drinks'], goalAffinities: ['dorm_snacks', 'party'], prepLevel: 'no_cook' },
  { slug: 'granola-bars', name: 'Granola bars', category: 'snacks', unit: 'box', defaultQuantity: 1, estimatedPriceMinor: 349, dietaryTags: ['vegetarian', 'halal', 'no_cooking', 'snacks_drinks'], goalAffinities: ['breakfast', 'dorm_snacks', 'healthy'], prepLevel: 'no_cook' },
  { slug: 'popcorn', name: 'Microwave popcorn', category: 'snacks', unit: 'box', defaultQuantity: 1, estimatedPriceMinor: 299, dietaryTags: ['vegetarian', 'halal', 'no_cooking', 'snacks_drinks', 'bulk_value'], goalAffinities: ['dorm_snacks', 'party'], prepLevel: 'no_cook' },
  { slug: 'trail-mix', name: 'Trail mix', category: 'snacks', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 449, dietaryTags: ['vegetarian', 'halal', 'high_protein', 'no_cooking', 'snacks_drinks', 'healthy'], goalAffinities: ['dorm_snacks', 'healthy', 'high_protein'], prepLevel: 'no_cook' },
  { slug: 'crackers', name: 'Crackers', category: 'snacks', unit: 'box', defaultQuantity: 1, estimatedPriceMinor: 269, dietaryTags: ['vegetarian', 'halal', 'no_cooking', 'snacks_drinks'], goalAffinities: ['dorm_snacks', 'party'], prepLevel: 'no_cook' },
  { slug: 'cookies', name: 'Chocolate chip cookies', category: 'snacks', unit: 'pack', defaultQuantity: 1, estimatedPriceMinor: 299, dietaryTags: ['vegetarian', 'halal', 'no_cooking', 'snacks_drinks'], goalAffinities: ['dorm_snacks', 'party'], prepLevel: 'no_cook' },

  // Beverage
  { slug: 'coffee', name: 'Ground coffee', category: 'beverage', unit: 'bag', defaultQuantity: 1, estimatedPriceMinor: 599, dietaryTags: ['vegetarian', 'halal', 'no_cooking', 'snacks_drinks'], goalAffinities: ['breakfast', 'dorm_snacks'], prepLevel: 'no_cook' },
  { slug: 'orange-juice', name: 'Orange juice', category: 'beverage', unit: 'carton', defaultQuantity: 1, estimatedPriceMinor: 349, dietaryTags: ['vegetarian', 'halal', 'no_cooking', 'healthy', 'snacks_drinks'], goalAffinities: ['breakfast', 'healthy'], prepLevel: 'no_cook' },
  { slug: 'bottled-water', name: 'Bottled water (case)', category: 'beverage', unit: 'case', defaultQuantity: 1, estimatedPriceMinor: 399, dietaryTags: ['vegetarian', 'halal', 'no_cooking', 'bulk_value', 'snacks_drinks'], goalAffinities: ['bulk_value', 'party', 'dorm_snacks'], prepLevel: 'no_cook' },
  { slug: 'sports-drinks', name: 'Sports drinks (pack)', category: 'beverage', unit: 'pack', defaultQuantity: 1, estimatedPriceMinor: 499, dietaryTags: ['halal', 'no_cooking', 'snacks_drinks'], goalAffinities: ['party', 'dorm_snacks'], prepLevel: 'no_cook' },
  { slug: 'soda', name: 'Soda (12-pack)', category: 'beverage', unit: 'pack', defaultQuantity: 1, estimatedPriceMinor: 599, dietaryTags: ['vegetarian', 'halal', 'no_cooking', 'snacks_drinks'], goalAffinities: ['party', 'dorm_snacks'], prepLevel: 'no_cook' },
];

async function seedGroceryStaples(): Promise<void> {
  for (const s of groceryStaples) {
    await prisma.groceryStapleItem.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        category: s.category,
        unit: s.unit,
        defaultQuantity: s.defaultQuantity,
        estimatedPriceMinor: s.estimatedPriceMinor,
        dietaryTags: s.dietaryTags,
        goalAffinities: s.goalAffinities,
        prepLevel: s.prepLevel,
      },
      create: s,
    });
  }
}

// Deterministic mock deals scattered around each campus (idempotent by externalId).
const dealTemplates = [
  { title: 'BOGO Pizza Slices', merchant: "Rosa's Pizza", category: 'food', cur: 599, orig: 1199 },
  { title: '$5 Student Bowl', merchant: 'Bowl Co', category: 'food', cur: 500, orig: 900 },
  { title: 'TI-84 Calculator Deal', merchant: 'Campus Trade', category: 'tech', cur: 6400, orig: 11900 },
  { title: 'Hoodie Sale', merchant: 'Campus Threads', category: 'clothing', cur: 2500, orig: 4500 },
  { title: 'Haircut Student Deal', merchant: 'Fade Lab', category: 'beauty', cur: 1500, orig: 2500 },
  { title: 'Oil Change Discount', merchant: 'QuickLube', category: 'automotive', cur: 2999, orig: 4999 },
  { title: 'Used Textbooks 50% Off', merchant: 'BookSwap', category: 'books', cur: 2000, orig: 4000 },
  { title: 'Desk Lamp Deal', merchant: 'HomeGoods', category: 'home', cur: 1200, orig: 2400 },
  { title: 'Grocery 20% Off', merchant: 'FreshMart', category: 'groceries', cur: 1600, orig: 2000 },
  { title: 'Movie Night 2-for-1', merchant: 'Cinema Plus', category: 'entertainment', cur: 1200, orig: 2400 },
];

async function seedDeals(): Promise<void> {
  const cats = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryId = new Map(cats.map((c) => [c.slug, c.id]));
  const dbCampuses = await prisma.campus.findMany();
  const dayMs = 24 * 60 * 60 * 1000;
  // Fixed base time so seeding stays deterministic across runs.
  const base = new Date('2026-06-19T00:00:00Z').getTime();

  for (let ci = 0; ci < dbCampuses.length; ci++) {
    const campus = dbCampuses[ci];
    for (let i = 0; i < 6; i++) {
      const t = dealTemplates[(ci * 3 + i) % dealTemplates.length];
      const catId = categoryId.get(t.category);
      if (!catId) continue;
      const externalId = `seed-${campus.slug}-${i}`;
      // Scatter within ~0.6 mi of the campus.
      const lat = campus.latitude + (i - 3) * 0.0025;
      const lng = campus.longitude + (((i * 7) % 5) - 2) * 0.0025;
      const endingSoon = i === 0;
      const expiresAt = new Date(base + (endingSoon ? 6 * 60 * 60 * 1000 : (i + 2) * dayMs));
      const data = {
        externalId,
        title: t.title,
        merchant: t.merchant,
        categoryId: catId,
        shortDescription: `${t.title} near ${campus.shortName}.`,
        detailedDescription: `Limited-time ${t.title.toLowerCase()} from ${t.merchant}, close to ${campus.name}.`,
        terms: 'Valid with student ID. While supplies last.',
        currentPriceMinor: BigInt(t.cur),
        originalPriceMinor: BigInt(t.orig),
        currency: 'USD',
        dealScore: 70 + ((ci * 6 + i) % 30),
        isOnline: false,
        isStudentOnly: i % 3 === 0,
        couponCode: i % 2 === 0 ? `SAVE${i}${ci}` : null,
        latitude: lat,
        longitude: lng,
        locationTags: campus.locationTags,
        visualSeed: ci * 6 + i,
        expiresAt,
        source: 'seed',
        status: 'published' as const,
      };
      await prisma.deal.upsert({ where: { externalId }, update: data, create: data });
    }
  }

  // A few online (no-location) deals — excluded from nearby, available in detail.
  const onlineTemplates = dealTemplates.slice(2, 5);
  for (let i = 0; i < onlineTemplates.length; i++) {
    const t = onlineTemplates[i];
    const catId = categoryId.get(t.category);
    if (!catId) continue;
    const externalId = `seed-online-${i}`;
    const data = {
      externalId,
      title: `${t.title} (Online)`,
      merchant: t.merchant,
      categoryId: catId,
      shortDescription: `${t.title} shipped anywhere.`,
      detailedDescription: `Online-only ${t.title.toLowerCase()} from ${t.merchant}.`,
      terms: 'Online redemption. Shipping not included.',
      currentPriceMinor: BigInt(t.cur),
      originalPriceMinor: BigInt(t.orig),
      currency: 'USD',
      dealScore: 65 + i,
      isOnline: true,
      isStudentOnly: false,
      destinationUrl: 'https://example.com/deal',
      locationTags: [] as string[],
      visualSeed: 100 + i,
      expiresAt: new Date(base + (i + 5) * dayMs),
      source: 'seed',
      status: 'published' as const,
    };
    await prisma.deal.upsert({ where: { externalId }, update: data, create: data });
  }
}

if (require.main === module) {
  main()
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
