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

// Real Atlanta crawl sources for the curated pipeline. Seeded DISABLED: each URL
// must be verified live + crawlable + permitted by the operator before enabling
// (the crawler hits the real page on `pnpm crawl`). `zoneSlug: 'atlanta'` makes
// crawled physical deals carry locationTags ['atlanta'], matching the ingestion
// providers so cross-source dedup (dealFingerprint) lines up. Replace/extend this
// list freely — upsert keys on `url`, so re-seeding is idempotent.
const crawlSources = [
  // Restaurants (food)
  { url: 'https://thevarsity.com/menu/', kind: 'restaurant' as const, merchantHint: 'The Varsity', defaultCategorySlug: 'food', crawlIntervalHours: 168 },
  { url: 'https://www.marymacs.com/menus/', kind: 'restaurant' as const, merchantHint: "Mary Mac's Tea Room", defaultCategorySlug: 'food', crawlIntervalHours: 168 },
  { url: 'https://www.foxbrosbarbq.com/menu', kind: 'restaurant' as const, merchantHint: 'Fox Bros Bar-B-Q', defaultCategorySlug: 'food', crawlIntervalHours: 168 },
  // Happy hour (food)
  { url: 'https://poncecitymarket.com/restaurants/', kind: 'happy_hour' as const, merchantHint: 'Ponce City Market', defaultCategorySlug: 'food', crawlIntervalHours: 72 },
  { url: 'https://batteryatl.com/dining/', kind: 'happy_hour' as const, merchantHint: 'The Battery Atlanta', defaultCategorySlug: 'food', crawlIntervalHours: 72 },
  // Student discounts (food)
  { url: 'https://dining.gsu.edu/specials/', kind: 'student_discount' as const, merchantHint: 'Georgia State Dining', defaultCategorySlug: 'food', crawlIntervalHours: 72 },
  { url: 'https://techdining.gatech.edu/specials/', kind: 'student_discount' as const, merchantHint: 'Georgia Tech Dining', defaultCategorySlug: 'food', crawlIntervalHours: 72 },
  // Grocery circulars (groceries) — weekly cadence
  { url: 'https://www.publix.com/savings/weekly-ad', kind: 'grocery_circular' as const, merchantHint: 'Publix', defaultCategorySlug: 'groceries', crawlIntervalHours: 168 },
  { url: 'https://www.kroger.com/weeklyad', kind: 'grocery_circular' as const, merchantHint: 'Kroger', defaultCategorySlug: 'groceries', crawlIntervalHours: 168 },
  // Local promos (entertainment)
  { url: 'https://beltline.org/events/', kind: 'local_promo' as const, merchantHint: 'Atlanta BeltLine', defaultCategorySlug: 'entertainment', crawlIntervalHours: 72 },
  { url: 'https://discoveratlanta.com/things-to-do/deals/', kind: 'local_promo' as const, merchantHint: 'Discover Atlanta', defaultCategorySlug: 'entertainment', crawlIntervalHours: 72 },
];

async function seedCrawlSources(): Promise<void> {
  for (const s of crawlSources) {
    await prisma.crawlSource.upsert({
      where: { url: s.url },
      // Update curatable metadata only — never silently re-enable a source the
      // operator has turned on/off, and don't reset crawl bookkeeping.
      update: {
        kind: s.kind,
        merchantHint: s.merchantHint,
        defaultCategorySlug: s.defaultCategorySlug,
        crawlIntervalHours: s.crawlIntervalHours,
      },
      create: {
        url: s.url,
        kind: s.kind,
        merchantHint: s.merchantHint,
        defaultCategorySlug: s.defaultCategorySlug,
        zoneSlug: 'atlanta',
        crawlIntervalHours: s.crawlIntervalHours,
        enabled: false, // operator verifies the URL, then flips this on
      },
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

  const [cat, sch, cam, deal, crawl] = await Promise.all([
    prisma.category.count(),
    prisma.school.count(),
    prisma.campus.count(),
    prisma.deal.count(),
    prisma.crawlSource.count(),
  ]);
  // eslint-disable-next-line no-console
  console.log(
    `Seeded: ${cat} categories, ${sch} schools, ${cam} campuses, ${deal} deals, ${crawl} crawl sources`,
  );
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

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
