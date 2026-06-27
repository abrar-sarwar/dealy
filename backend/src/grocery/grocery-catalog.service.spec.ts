import { GroceryCatalogService } from './grocery-catalog.service';
import type { CatalogStaple } from './grocery.types';

function staple(p: Partial<CatalogStaple> & Pick<CatalogStaple, 'slug' | 'category'>): CatalogStaple {
  return {
    name: p.slug,
    unit: 'each',
    defaultQuantity: 1,
    estimatedPriceMinor: 300,
    dietaryTags: [],
    goalAffinities: [],
    prepLevel: 'low',
    ...p,
  };
}

// selectStaples is pure → instantiate with a null prisma; we never touch it.
const svc = new GroceryCatalogService(null as never);

const CATALOG: CatalogStaple[] = [
  staple({ slug: 'eggs', category: 'protein', estimatedPriceMinor: 249, dietaryTags: ['vegetarian', 'high_protein', 'halal'], goalAffinities: ['high_protein', 'cheapest'] }),
  staple({ slug: 'chicken', category: 'protein', estimatedPriceMinor: 399, dietaryTags: ['high_protein', 'halal'], goalAffinities: ['high_protein'] }),
  staple({ slug: 'bacon', category: 'protein', estimatedPriceMinor: 599, dietaryTags: ['high_protein'], goalAffinities: ['high_protein', 'breakfast'] }),
  staple({ slug: 'rice', category: 'grains', estimatedPriceMinor: 549, dietaryTags: ['vegetarian', 'halal', 'bulk_value'], goalAffinities: ['cheapest', 'meal_prep'] }),
  staple({ slug: 'cookies', category: 'snacks', estimatedPriceMinor: 299, dietaryTags: ['vegetarian', 'snacks_drinks'], goalAffinities: ['dorm_snacks'] }),
  staple({ slug: 'spinach', category: 'produce', estimatedPriceMinor: 279, dietaryTags: ['vegetarian', 'halal', 'healthy'], goalAffinities: ['healthy'] }),
  staple({ slug: 'tofu', category: 'protein', estimatedPriceMinor: 199, dietaryTags: ['vegetarian', 'halal', 'high_protein', 'healthy'], goalAffinities: ['high_protein', 'healthy'] }),
];

describe('GroceryCatalogService.selectStaples', () => {
  it('prioritises goal-affinity staples', () => {
    const picked = svc.selectStaples(CATALOG, {
      goal: 'high_protein',
      dietary: [],
      excluded: [],
      budgetMinor: 5000,
      timeframe: '3_days',
    });
    // Every high-protein staple should appear given the generous budget.
    const slugs = picked.map((p) => p.slug);
    expect(slugs).toEqual(expect.arrayContaining(['eggs', 'chicken', 'tofu']));
  });

  it('hard-filters dietary constraints (vegetarian excludes meat)', () => {
    const picked = svc.selectStaples(CATALOG, {
      goal: 'high_protein',
      dietary: ['vegetarian'],
      excluded: [],
      budgetMinor: 5000,
      timeframe: '3_days',
    });
    const slugs = picked.map((p) => p.slug);
    expect(slugs).not.toContain('chicken');
    expect(slugs).not.toContain('bacon');
    expect(slugs).toContain('eggs');
    expect(slugs).toContain('tofu');
  });

  it('drops excluded items by keyword', () => {
    const picked = svc.selectStaples(CATALOG, {
      goal: 'high_protein',
      dietary: [],
      excluded: ['bacon'],
      budgetMinor: 5000,
      timeframe: '3_days',
    });
    expect(picked.map((p) => p.slug)).not.toContain('bacon');
  });

  it('stays within budget (line totals never exceed it)', () => {
    const picked = svc.selectStaples(CATALOG, {
      goal: 'cheapest',
      dietary: [],
      excluded: [],
      budgetMinor: 800,
      timeframe: '3_days',
    });
    const total = picked.reduce((sum, p) => sum + p.estimatedPriceMinor, 0);
    expect(total).toBeLessThanOrEqual(800);
    expect(picked.length).toBeGreaterThan(0);
  });

  it('scales quantities for a 1-week timeframe', () => {
    const picked = svc.selectStaples(CATALOG, {
      goal: 'cheapest',
      dietary: [],
      excluded: [],
      budgetMinor: 10000,
      timeframe: '1_week',
    });
    const eggs = picked.find((p) => p.slug === 'eggs');
    expect(eggs?.quantity).toBe(2);
    expect(eggs?.estimatedPriceMinor).toBe(249 * 2);
  });

  it('returns an empty basket when nothing is affordable', () => {
    const picked = svc.selectStaples(CATALOG, {
      goal: 'cheapest',
      dietary: [],
      excluded: [],
      budgetMinor: 50,
      timeframe: '3_days',
    });
    expect(picked).toEqual([]);
  });
});
