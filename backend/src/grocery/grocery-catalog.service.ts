import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  BasketGoal,
  BasketLineItem,
  BasketTimeframe,
  CatalogStaple,
  DietaryPreference,
} from './grocery.types';

/** Dietary prefs that are HARD constraints (an item must carry the tag to be
 *  eligible). The rest act as soft ranking affinities so baskets stay viable. */
const HARD_DIETARY: ReadonlySet<DietaryPreference> = new Set<DietaryPreference>([
  'vegetarian',
  'halal',
  'no_cooking',
]);

/** Per-item quantity multiplier by timeframe (a week needs more of each staple). */
const TIMEFRAME_QTY_MULTIPLIER: Record<BasketTimeframe, number> = {
  today: 1,
  '3_days': 1,
  '1_week': 2,
};

/** Target number of distinct staples per timeframe (before the budget cap). */
const TIMEFRAME_TARGET_ITEMS: Record<BasketTimeframe, number> = {
  today: 6,
  '3_days': 10,
  '1_week': 14,
};

/** Cap on staples drawn from any one category so a basket stays balanced. */
const MAX_PER_CATEGORY = 3;

const GOAL_AFFINITY_BOOST = 3;

export interface SelectStaplesOptions {
  goal: BasketGoal;
  dietary: DietaryPreference[];
  excluded: string[];
  budgetMinor: number;
  timeframe: BasketTimeframe;
}

/**
 * Loads the seeded staples catalog and selects a goal/dietary-fit basket that
 * greedily fills toward the budget. `selectStaples` is PURE (takes the staples
 * array) so it is unit-tested without a database.
 */
@Injectable()
export class GroceryCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Read the full staples catalog from the database. */
  async loadStaples(): Promise<CatalogStaple[]> {
    const rows = await this.prisma.groceryStapleItem.findMany({ orderBy: { slug: 'asc' } });
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      category: r.category,
      unit: r.unit,
      defaultQuantity: r.defaultQuantity,
      estimatedPriceMinor: r.estimatedPriceMinor,
      dietaryTags: r.dietaryTags,
      goalAffinities: r.goalAffinities,
      prepLevel: r.prepLevel,
    }));
  }

  /**
   * Pure selection: filter by dietary hard-constraints − exclusions, rank by goal
   * affinity + soft dietary affinity (cheaper breaks ties), then greedily fill
   * toward the budget with per-category balance and timeframe-scaled quantities.
   */
  selectStaples(staples: CatalogStaple[], opts: SelectStaplesOptions): BasketLineItem[] {
    const excludedLc = opts.excluded.map((e) => e.trim().toLowerCase()).filter(Boolean);
    const isExcluded = (s: CatalogStaple): boolean =>
      excludedLc.some(
        (e) => s.slug.includes(e) || s.name.toLowerCase().includes(e) || s.category === e,
      );

    const hard = opts.dietary.filter((d) => HARD_DIETARY.has(d));
    const soft = opts.dietary.filter((d) => !HARD_DIETARY.has(d));

    const eligible = staples.filter(
      (s) => !isExcluded(s) && hard.every((h) => s.dietaryTags.includes(h)),
    );

    const score = (s: CatalogStaple): number => {
      let sc = 1;
      if (opts.goal !== 'custom' && s.goalAffinities.includes(opts.goal)) sc += GOAL_AFFINITY_BOOST;
      sc += soft.filter((d) => s.dietaryTags.includes(d)).length;
      return sc;
    };

    const ranked = [...eligible].sort(
      (a, b) => score(b) - score(a) || a.estimatedPriceMinor - b.estimatedPriceMinor,
    );

    const qtyMult = TIMEFRAME_QTY_MULTIPLIER[opts.timeframe];
    const target = TIMEFRAME_TARGET_ITEMS[opts.timeframe];

    // Line total = per-unit estimate × pack quantity × timeframe multiplier.
    const lineTotalMinor = (s: CatalogStaple): number =>
      s.estimatedPriceMinor * s.defaultQuantity * qtyMult;

    const chosen: CatalogStaple[] = [];
    const perCat = new Map<string, number>();
    let total = 0;
    for (const s of ranked) {
      if (chosen.length >= target) break;
      const catN = perCat.get(s.category) ?? 0;
      if (catN >= MAX_PER_CATEGORY) continue;
      const lineTotal = lineTotalMinor(s);
      if (total + lineTotal > opts.budgetMinor) continue;
      chosen.push(s);
      perCat.set(s.category, catN + 1);
      total += lineTotal;
    }

    // Guarantee a non-empty basket when anything affordable exists: include the
    // single cheapest eligible staple if the greedy pass found nothing.
    if (chosen.length === 0 && ranked.length > 0) {
      const cheapest = ranked.reduce((a, b) => (lineTotalMinor(a) <= lineTotalMinor(b) ? a : b));
      if (lineTotalMinor(cheapest) <= opts.budgetMinor) chosen.push(cheapest);
    }

    return chosen.map((s) => ({
      slug: s.slug,
      name: s.name,
      category: s.category,
      unit: s.unit,
      quantity: s.defaultQuantity * qtyMult,
      estimatedPriceMinor: lineTotalMinor(s),
      substitutionOptions: this.cheaperSwaps(s, eligible),
    }));
  }

  /** Up to two cheaper, eligible same-category staples as suggested swaps. */
  private cheaperSwaps(target: CatalogStaple, eligible: CatalogStaple[]): string[] {
    return eligible
      .filter(
        (s) =>
          s.slug !== target.slug &&
          s.category === target.category &&
          s.estimatedPriceMinor < target.estimatedPriceMinor,
      )
      .sort((a, b) => a.estimatedPriceMinor - b.estimatedPriceMinor)
      .slice(0, 2)
      .map((s) => s.name);
  }
}
