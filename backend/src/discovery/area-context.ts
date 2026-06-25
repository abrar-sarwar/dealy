import { createHash } from 'node:crypto';

/** Region granularity. Campus zones get student-focused planning/extraction; the
 *  rest are general-consumer surfaces. */
export type RegionType = 'campus' | 'district' | 'city' | 'metro';

/**
 * Area-aware context handed to Gemini for crawl planning + deal extraction.
 *
 * It NEVER lets Gemini invent supply — it only makes the model SMARTER about the
 * REAL scraped content: which pages are worth a paid fetch (planCrawl), how to
 * judge an offer's relevance (extractDeals area_relevance), and what audience the
 * area implies. Gemini still returns nothing when a page holds no concrete offers.
 */
export interface AreaDiscoveryContext {
  regionSlug: string;
  regionName: string;
  regionType: RegionType;
  latitude?: number;
  longitude?: number;
  radiusMiles: number;
  /** Categories worth surfacing for this area, e.g. ['food','groceries',...]. */
  desiredCategories: string[];
  campusSlug?: string;
  campusName?: string;
  audienceFocus: 'students' | 'campus_community' | 'general';
  /** Human goal for the source, derived from source.kind (e.g. 'restaurants'). */
  sourceGoal: string;
}

/** Minimal regional-inventory shape this builder reads. */
export interface AreaInventoryInput {
  regionSlug: string;
  regionName: string;
  regionType: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles: number;
}

/** Minimal source shape this builder reads. */
export interface AreaSourceInput {
  zoneSlug?: string | null;
  /** CrawlKind value (restaurant | grocery_circular | student_discount | …). */
  kind?: string | null;
  /** sourceType (merchant_site, weekly_ad, …) — a coarser fallback for sourceGoal. */
  sourceType?: string | null;
  defaultCategorySlug?: string | null;
}

/** Campus zones — these become regionType 'campus' with a student audience focus. */
const CAMPUS_ZONES: Record<string, string> = {
  gsu: 'Georgia State University',
  gt: 'Georgia Tech',
  ksu: 'Kennesaw State University',
  uga: 'University of Georgia',
};

const VALID_REGION_TYPES: ReadonlySet<RegionType> = new Set<RegionType>([
  'campus',
  'district',
  'city',
  'metro',
]);

function coerceRegionType(raw: string | undefined): RegionType {
  return raw && VALID_REGION_TYPES.has(raw as RegionType) ? (raw as RegionType) : 'metro';
}

/** Map source.kind / sourceType → a short human goal phrase. */
function sourceGoalFor(source: AreaSourceInput): string {
  const k = (source.kind ?? '').toLowerCase();
  switch (k) {
    case 'grocery_circular':
      return 'groceries';
    case 'restaurant':
      return 'restaurants';
    case 'happy_hour':
      return 'happy-hour and drink specials';
    case 'student_discount':
      return 'student discounts';
    case 'local_promo':
      return 'local deals';
  }
  const t = (source.sourceType ?? '').toLowerCase();
  switch (t) {
    case 'merchant_site':
      return 'local deals';
    case 'weekly_ad':
      return 'groceries';
    case 'student_discount':
      return 'student discounts';
  }
  return 'local deals';
}

/** Desired categories per region type (+ source default mixed in). */
function desiredCategoriesFor(regionType: RegionType, source: AreaSourceInput): string[] {
  const base =
    regionType === 'campus'
      ? ['food', 'student', 'campus', 'entertainment']
      : ['food', 'groceries', 'entertainment', 'services'];
  const out = [...base];
  const def = source.defaultCategorySlug?.trim();
  if (def && !out.includes(def)) out.unshift(def);
  return out;
}

/**
 * Build the area context from regional inventory + the source being crawled.
 * Campus zones (gsu/gt/ksu/uga) always become regionType 'campus' regardless of
 * the stored inventory.regionType.
 */
export function buildAreaContext(
  inventory: AreaInventoryInput | null,
  source: AreaSourceInput,
): AreaDiscoveryContext {
  const regionSlug = inventory?.regionSlug ?? source.zoneSlug ?? 'unknown';
  // A source's zoneSlug is the canonical campus signal in this pipeline (the
  // runner tags campusSlug from it); honour it even when the regional inventory
  // is a broader metro row.
  const campusSlug = [regionSlug, source.zoneSlug ?? ''].find((s) => s in CAMPUS_ZONES);
  const isCampus = campusSlug != null;
  const regionType: RegionType = isCampus ? 'campus' : coerceRegionType(inventory?.regionType);

  const campusName = campusSlug ? CAMPUS_ZONES[campusSlug] : undefined;
  // student_discount sources lean fully student even on a broad campus zone.
  const audienceFocus: AreaDiscoveryContext['audienceFocus'] = isCampus
    ? source.kind === 'student_discount'
      ? 'students'
      : 'campus_community'
    : 'general';

  return {
    regionSlug,
    regionName: inventory?.regionName ?? regionSlug,
    regionType,
    latitude: inventory?.latitude ?? undefined,
    longitude: inventory?.longitude ?? undefined,
    radiusMiles: inventory?.radiusMiles ?? 10,
    desiredCategories: desiredCategoriesFor(regionType, source),
    campusSlug: campusSlug ?? undefined,
    campusName,
    audienceFocus,
    sourceGoal: sourceGoalFor(source),
  };
}

/**
 * Stable short hash over the fields that should bust the AI cache when area
 * context changes. Coordinates/radius are intentionally excluded: they refine
 * geocoding but do not change the extraction prompt's semantics.
 */
export function areaContextHash(ctx: AreaDiscoveryContext): string {
  const material = JSON.stringify({
    regionSlug: ctx.regionSlug,
    desiredCategories: ctx.desiredCategories,
    audienceFocus: ctx.audienceFocus,
    sourceGoal: ctx.sourceGoal,
  });
  return createHash('sha256').update(material).digest('hex').slice(0, 12);
}
