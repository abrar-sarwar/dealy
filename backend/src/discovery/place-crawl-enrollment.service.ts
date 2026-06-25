import { Injectable, Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/** A place we may enroll — the subset of Place fields enrollment reasons about. */
export interface EnrollablePlace {
  id: string;
  name: string;
  website: string | null;
  categorySlug: string;
  googleTypes: string[];
  regionSlug: string;
  campusSlug: string | null;
}

/** Outcome of evaluating a single place for crawl enrollment. */
export type EligibilityReason = 'eligible' | 'no-website' | 'category';

/** Structured tally of an `enrollRegion` run (also logged for P2 observability). */
export interface EnrollmentLog {
  regionSlug: string;
  placesConsidered: number;
  eligible: number;
  skippedNoWebsite: number;
  skippedCategory: number;
  enrolled: number;
  alreadyEnrolled: number;
}

export interface EnrollRegionOptions {
  maxPlaces?: number;
}

const DEFAULT_MAX_PLACES = 25;

/** Useful consumer categories that plausibly publish deals/specials on a website.
 *  Keyed off either our internal `categorySlug` or Google's raw `types`, so a
 *  generically-categorised place still matches on its specific Google types. */
interface CategoryRule {
  /** CrawlKind to seed the source with. */
  kind: 'restaurant' | 'happy_hour' | 'student_discount' | 'grocery_circular' | 'local_promo';
  /** Default category slug for extracted candidates. */
  defaultCategorySlug: string;
  /** Our internal Place.categorySlug values that map here. */
  categorySlugs: string[];
  /** Google `types` tokens (regex) that map here. */
  googleTypes: RegExp;
}

/** First matching rule wins. Order matters: more specific googleTypes first. */
const CATEGORY_RULES: CategoryRule[] = [
  {
    kind: 'grocery_circular',
    defaultCategorySlug: 'groceries',
    categorySlugs: ['grocery', 'groceries'],
    googleTypes: /^(supermarket|grocery_or_supermarket|grocery_store|convenience_store)$/,
  },
  {
    kind: 'restaurant',
    defaultCategorySlug: 'food',
    categorySlugs: ['food', 'cafe'],
    googleTypes:
      /^(restaurant|cafe|bakery|bar|meal_takeaway|meal_delivery|food|coffee_shop|.*_restaurant)$/,
  },
  {
    kind: 'local_promo',
    defaultCategorySlug: 'beauty',
    categorySlugs: ['barber', 'hair', 'beauty'],
    googleTypes: /^(hair_care|barber_shop|beauty_salon|nail_salon|spa)$/,
  },
  {
    kind: 'local_promo',
    defaultCategorySlug: 'health',
    categorySlugs: ['gym', 'fitness', 'health'],
    googleTypes: /^(gym|fitness_center|yoga_studio|health)$/,
  },
  {
    kind: 'local_promo',
    defaultCategorySlug: 'clothing',
    categorySlugs: ['thrift', 'secondhand'],
    googleTypes: /^(thrift_store|second_hand_store|consignment)$/,
  },
  {
    kind: 'local_promo',
    defaultCategorySlug: 'automotive',
    categorySlugs: ['car_repair', 'auto', 'automotive'],
    googleTypes: /^(car_repair|car_wash|auto_parts_store|car_dealer)$/,
  },
  {
    kind: 'local_promo',
    defaultCategorySlug: 'tech',
    categorySlugs: ['tech', 'electronics'],
    googleTypes: /^(electronics_store|electronics_repair|cell_phone_store|computer_store)$/,
  },
  {
    kind: 'local_promo',
    defaultCategorySlug: 'home',
    categorySlugs: ['laundromat', 'home_services', 'home'],
    googleTypes: /^(laundry|laundromat|dry_cleaner|plumber|electrician|locksmith)$/,
  },
];

function matchRule(place: EnrollablePlace): CategoryRule | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.categorySlugs.includes(place.categorySlug)) return rule;
    if (place.googleTypes.some((t) => rule.googleTypes.test(t))) return rule;
  }
  return null;
}

/** Pure eligibility classifier — exported for direct unit testing. */
export function isEligiblePlace(place: EnrollablePlace): EligibilityReason {
  if (!place.website) return 'no-website';
  return matchRule(place) ? 'eligible' : 'category';
}

/**
 * P2 — turns discovered Places that have websites into targeted Firecrawl crawl
 * sources. Eligibility is conservative (consumer categories only, website
 * required) and capped per run; sources are upserted keyed on placeId so re-runs
 * never duplicate. dealUrl is left null and targetPaths empty, so the runner
 * lets Gemini's planCrawl gate decide and `resolveCrawlTargets` synthesizes the
 * allowed targeted paths from the merchant homepage — smart, not blind crawling.
 */
@Injectable()
export class PlaceCrawlEnrollmentService {
  private readonly logger = new Logger(PlaceCrawlEnrollmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enrollRegion(regionSlug: string, opts: EnrollRegionOptions = {}): Promise<EnrollmentLog> {
    const maxPlaces = opts.maxPlaces ?? DEFAULT_MAX_PLACES;

    const places = (await this.prisma.place.findMany({
      where: { regionSlug },
      select: {
        id: true,
        name: true,
        website: true,
        categorySlug: true,
        googleTypes: true,
        regionSlug: true,
        campusSlug: true,
      },
    })) as EnrollablePlace[];

    const log: EnrollmentLog = {
      regionSlug,
      placesConsidered: places.length,
      eligible: 0,
      skippedNoWebsite: 0,
      skippedCategory: 0,
      enrolled: 0,
      alreadyEnrolled: 0,
    };

    for (const place of places) {
      const reason = isEligiblePlace(place);
      if (reason === 'no-website') {
        log.skippedNoWebsite++;
        continue;
      }
      if (reason === 'category') {
        log.skippedCategory++;
        continue;
      }
      log.eligible++;

      // Cap is on ENROLLMENTS this run — count eligibility honestly but stop
      // upserting once we hit the per-region cap (keeps API spend bounded).
      if (log.enrolled + log.alreadyEnrolled >= maxPlaces) continue;

      const rule = matchRule(place)!;
      const existing = await this.prisma.crawlSource.findUnique({
        where: { placeId: place.id },
        select: { id: true },
      });

      await this.prisma.crawlSource.upsert({
        where: { placeId: place.id },
        create: {
          url: place.website!,
          kind: rule.kind,
          merchantHint: place.name,
          defaultCategorySlug: rule.defaultCategorySlug,
          zoneSlug: place.regionSlug,
          placeId: place.id,
          enabled: true,
          sourceType: 'merchant_site',
          // Let the runner synthesize targeted paths from the allowlist, and let
          // Gemini's planCrawl gate decide whether the page is worth a paid fetch.
          targetPaths: [],
          dealUrl: null,
        },
        // Re-enrollment refreshes the homepage + merchant name without disturbing
        // crawl state (reliability, lastCrawledAt, averageDealsFound).
        update: {
          url: place.website!,
          merchantHint: place.name,
          kind: rule.kind,
          defaultCategorySlug: rule.defaultCategorySlug,
          zoneSlug: place.regionSlug,
        },
      });

      if (existing) log.alreadyEnrolled++;
      else log.enrolled++;
    }

    this.logger.log(`place-crawl-enrollment ${regionSlug}: ${JSON.stringify(log)}`);
    return log;
  }
}
