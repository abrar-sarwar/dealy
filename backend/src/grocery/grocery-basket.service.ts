import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Deal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PlaceFeedService } from '../discovery/place-feed.service';
import type { GeminiClient } from '../services/gemini/gemini.client';
import type { AiCacheService } from '../discovery/ai-cache.service';
import type { RateLimiter } from '../discovery/rate-limiter';
import type { GeminiConfig } from '../config/gemini';
import { BasketRecommendationService } from './basket-recommendation.service';
import { GroceryCatalogService } from './grocery-catalog.service';
import {
  dealTrust,
  type BasketGoal,
  type BasketLineItem,
  type BasketTimeframe,
  type CandidateStore,
  type Confidence,
  type DietaryPreference,
  type StoreOffer,
  type StoreScore,
  type TrustLabel,
} from './grocery.types';

/** Known student grocery chains used as a fallback when live data is thin. */
const KNOWN_STORES = ['Aldi', 'Kroger', 'Publix', 'Walmart', 'Food City'];

const EARTH_RADIUS_MILES = 3958.7613;
const DEFAULT_MAX_DISTANCE = 10;

/** Human-readable goal labels for titles/explanations. */
const GOAL_LABELS: Record<BasketGoal, string> = {
  cheapest: 'Cheapest',
  meal_prep: 'Meal-Prep',
  high_protein: 'High-Protein',
  dorm_snacks: 'Dorm-Snacks',
  breakfast: 'Breakfast',
  quick_meals: 'Quick-Meals',
  healthy: 'Healthy',
  party: 'Party',
  custom: 'Custom',
};

/** Internal (already-normalised) request the service operates on. */
export interface GenerateBasketInput {
  latitude: number;
  longitude: number;
  region?: string | null;
  campus?: string | null;
  budgetMinor: number;
  goal: BasketGoal;
  timeframe: BasketTimeframe;
  dietary: DietaryPreference[];
  excludedItems: string[];
  preferredStores: string[];
  maxDistanceMiles: number;
  allowSecondStop: boolean;
}

const basketInclude = {
  items: { include: { dealMatch: true }, orderBy: { createdAt: 'asc' } },
  storeRecs: { orderBy: { score: 'desc' } },
} satisfies Prisma.GroceryBasketInclude;

export type BasketEntity = Prisma.GroceryBasketGetPayload<{ include: typeof basketInclude }>;

function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Keyword match: a salient token of the staple name appears in the deal text. */
function dealMatchesItem(deal: Deal, item: BasketLineItem): boolean {
  const haystack = `${deal.title} ${deal.merchant}`.toLowerCase();
  const tokens = item.name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 4);
  return tokens.some((t) => haystack.includes(t));
}

/**
 * Orchestrates Smart Basket generation: resolve location + candidate stores,
 * select staples, match real grocery deals, rank stores, build an explanation
 * (template default, best-effort Gemini upgrade), persist, and expose fetch.
 */
@Injectable()
export class GroceryBasketService {
  private readonly logger = new Logger(GroceryBasketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: GroceryCatalogService,
    private readonly recommendation: BasketRecommendationService,
    private readonly placeFeed: PlaceFeedService,
    private readonly gemini: GeminiClient,
    private readonly aiCache: AiCacheService,
    private readonly rateLimiter: RateLimiter,
    private readonly geminiConfig: GeminiConfig,
  ) {}

  async generate(input: GenerateBasketInput): Promise<BasketEntity> {
    const start = Date.now();
    const maxDistance = input.maxDistanceMiles || DEFAULT_MAX_DISTANCE;
    const regionSlug =
      input.region ??
      (await this.placeFeed.resolveRegion({
        latitude: input.latitude,
        longitude: input.longitude,
      }));

    const staples = await this.catalog.loadStaples();
    const items = this.catalog.selectStaples(staples, {
      goal: input.goal,
      dietary: input.dietary,
      excluded: input.excludedItems,
      budgetMinor: input.budgetMinor,
      timeframe: input.timeframe,
    });

    const groceryDeals = await this.nearbyGroceryDeals(input, maxDistance);
    const dealById = new Map(groceryDeals.map((d) => [d.id, d]));
    const stores = await this.buildCandidateStores(
      input,
      items,
      groceryDeals,
      regionSlug,
      maxDistance,
    );

    const ranking = this.recommendation.rankStores(items, stores, {
      budgetMinor: input.budgetMinor,
      maxDistanceMiles: maxDistance,
      allowSecondStop: input.allowSecondStop,
    });

    const assembled = this.assembleItems(items, ranking.bestStore, ranking.secondStop, dealById);

    const estimatedTotalMinor = assembled.reduce((s, a) => s + a.priceMinor, 0);
    const estimatedSavingsMinor = assembled.reduce(
      (s, a) => s + Math.max(0, a.estimateMinor - a.priceMinor),
      0,
    );
    const sourceStatus = this.deriveSourceStatus(assembled);
    const title = `$${Math.round(input.budgetMinor / 100)} ${GOAL_LABELS[input.goal]} Grocery Run`;
    const { text: explanation, geminiUsed, cacheHit } = await this.buildExplanation({
      best: ranking.bestStore,
      second: ranking.secondStop,
      budgetMinor: input.budgetMinor,
      estimatedTotalMinor,
      sourceStatus,
    });

    const created = await this.prisma.groceryBasket.create({
      data: {
        userId: null,
        title,
        goal: input.goal,
        budgetMinor: input.budgetMinor,
        timeframe: input.timeframe,
        latitude: input.latitude,
        longitude: input.longitude,
        regionSlug: regionSlug ?? null,
        campusSlug: input.campus ?? null,
        estimatedTotalMinor,
        estimatedSavingsMinor,
        confidence: ranking.confidence,
        explanation,
        sourceStatus,
        routeSummary: ranking.routeSummary,
        dietaryPrefs: input.dietary,
        items: {
          create: assembled.map((a) => ({
            name: a.item.name,
            stapleSlug: a.item.slug,
            category: a.item.category,
            estimatedPriceMinor: a.priceMinor,
            quantity: a.item.quantity,
            unit: a.item.unit,
            storeName: a.storeName,
            matchedDealId: a.deal?.id ?? null,
            confidence: a.band,
            trustLabel: a.trustLabel,
            substitutions: a.item.substitutionOptions,
            dealMatch: a.deal
              ? {
                  create: this.dealMatchData(a.deal, a.priceMinor, a.band),
                }
              : undefined,
          })),
        },
        storeRecs: { create: this.storeRecData(ranking.bestStore, ranking.secondStop, input) },
      },
      include: basketInclude,
    });

    this.logger.log({
      msg: 'smart_basket.generate',
      region: regionSlug ?? null,
      goal: input.goal,
      confidence: ranking.confidence,
      sourceStatus,
      itemCount: assembled.length,
      durationMs: Date.now() - start,
      geminiUsed,
      cacheHit,
    });
    return created;
  }

  async regenerate(id: string): Promise<BasketEntity> {
    const existing = await this.prisma.groceryBasket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Basket ${id} not found`);
    return this.generate({
      latitude: existing.latitude,
      longitude: existing.longitude,
      region: existing.regionSlug,
      campus: existing.campusSlug,
      budgetMinor: existing.budgetMinor,
      goal: existing.goal as BasketGoal,
      timeframe: existing.timeframe as BasketTimeframe,
      dietary: existing.dietaryPrefs as DietaryPreference[],
      excludedItems: [],
      preferredStores: [],
      maxDistanceMiles: DEFAULT_MAX_DISTANCE,
      allowSecondStop: true,
    });
  }

  async getById(id: string): Promise<BasketEntity> {
    const basket = await this.prisma.groceryBasket.findUnique({
      where: { id },
      include: basketInclude,
    });
    if (!basket) throw new NotFoundException(`Basket ${id} not found`);
    return basket;
  }

  /** Active, physical, grocery-category deals within range. */
  private async nearbyGroceryDeals(
    input: GenerateBasketInput,
    maxDistance: number,
  ): Promise<Deal[]> {
    const deals = await this.prisma.deal.findMany({
      where: {
        status: 'published',
        expiresAt: { gt: new Date() },
        latitude: { not: null },
        longitude: { not: null },
        category: { slug: { in: ['groceries', 'food'] } },
      },
      take: 300,
    });
    return deals.filter(
      (d) =>
        d.latitude != null &&
        d.longitude != null &&
        haversineMiles(input, { latitude: d.latitude, longitude: d.longitude }) <= maxDistance,
    );
  }

  /** Build candidate grocery stores from matched deal merchants, grocery Places,
   *  preferred stores, and the known-store fallback list. Every store stocks the
   *  selected staples at estimate; matched deals override price + trust. */
  private async buildCandidateStores(
    input: GenerateBasketInput,
    items: BasketLineItem[],
    groceryDeals: Deal[],
    regionSlug: string | null,
    maxDistance: number,
  ): Promise<CandidateStore[]> {
    const byName = new Map<string, CandidateStore>();

    const offersFor = (storeName: string): StoreOffer[] =>
      items.map((it) => {
        const deal = groceryDeals.find(
          (d) =>
            d.merchant.toLowerCase() === storeName.toLowerCase() &&
            d.currentPriceMinor != null &&
            dealMatchesItem(d, it),
        );
        if (deal && deal.currentPriceMinor != null) {
          return {
            slug: it.slug,
            priceMinor: Number(deal.currentPriceMinor) * it.quantity,
            matchedDealId: deal.id,
            dealConfidence: dealTrust(deal).confidence,
          };
        }
        return {
          slug: it.slug,
          priceMinor: it.estimatedPriceMinor,
          dealConfidence: 0,
          matchedDealId: null,
        };
      });

    // 1. Merchants that have grocery deals nearby.
    for (const d of groceryDeals) {
      const key = d.merchant.toLowerCase();
      if (byName.has(key)) continue;
      const dist =
        d.latitude != null && d.longitude != null
          ? haversineMiles(input, { latitude: d.latitude, longitude: d.longitude })
          : null;
      byName.set(key, {
        name: d.merchant,
        placeId: null,
        kind: 'deal',
        distanceMiles: dist,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
        offers: offersFor(d.merchant),
      });
    }

    // 2. Grocery Places in the resolved region.
    if (regionSlug) {
      const places = await this.prisma.place.findMany({
        where: {
          regionSlug,
          OR: [
            { categorySlug: { in: ['grocery', 'groceries'] } },
            { googleTypes: { hasSome: ['grocery_or_supermarket', 'supermarket'] } },
          ],
        },
        take: 50,
      });
      for (const p of places) {
        const key = p.name.toLowerCase();
        if (byName.has(key)) continue;
        const dist = haversineMiles(input, { latitude: p.latitude, longitude: p.longitude });
        if (dist > maxDistance) continue;
        byName.set(key, {
          name: p.name,
          placeId: p.id,
          kind: 'place',
          distanceMiles: dist,
          latitude: p.latitude,
          longitude: p.longitude,
          offers: offersFor(p.name),
        });
      }
    }

    // 3. Preferred stores + known fallback list (estimate-only, distance unknown).
    for (const name of [...input.preferredStores, ...KNOWN_STORES]) {
      const key = name.toLowerCase();
      if (byName.has(key)) continue;
      byName.set(key, {
        name,
        placeId: null,
        kind: 'known',
        distanceMiles: null,
        latitude: null,
        longitude: null,
        offers: offersFor(name),
      });
    }

    return [...byName.values()];
  }

  /** Assign each item to its cheapest chosen store and resolve trust labels. */
  private assembleItems(
    items: BasketLineItem[],
    best: StoreScore | null,
    second: StoreScore | null,
    dealById: Map<string, Deal>,
  ): AssembledItem[] {
    return items.map((item) => {
      const candidates: Array<{ name: string; offer: StoreOffer }> = [];
      const bestOffer = best?.store.offers.find((o) => o.slug === item.slug);
      if (best && bestOffer) candidates.push({ name: best.store.name, offer: bestOffer });
      const secondOffer = second?.store.offers.find((o) => o.slug === item.slug);
      if (second && secondOffer) candidates.push({ name: second.store.name, offer: secondOffer });

      const pick = candidates.sort((a, b) => a.offer.priceMinor - b.offer.priceMinor)[0];
      if (!pick) {
        // Uncovered: list at estimate, flagged honestly.
        return {
          item,
          storeName: best?.store.name ?? null,
          priceMinor: item.estimatedPriceMinor,
          estimateMinor: item.estimatedPriceMinor,
          trustLabel: 'estimated',
          band: 'medium',
          deal: null,
        };
      }
      const deal = pick.offer.matchedDealId
        ? (dealById.get(pick.offer.matchedDealId) ?? null)
        : null;
      const trust = deal ? dealTrust(deal) : null;
      return {
        item,
        storeName: pick.name,
        priceMinor: pick.offer.priceMinor,
        estimateMinor: item.estimatedPriceMinor,
        trustLabel: trust?.label ?? 'estimated',
        band: trust?.band ?? 'medium',
        deal,
      };
    });
  }

  /** Basket-level source status from the strongest item label (BH6 taxonomy). */
  private deriveSourceStatus(items: AssembledItem[]): string {
    if (items.some((i) => i.trustLabel === 'verified')) return 'verified';
    if (items.some((i) => i.trustLabel === 'source_backed')) return 'source_backed';
    if (items.some((i) => i.trustLabel === 'needs_verification')) return 'needs_verification';
    if (items.some((i) => i.trustLabel === 'low_confidence')) return 'low_confidence';
    return 'estimated';
  }

  private dealMatchData(
    deal: Deal,
    priceMinor: number,
    band: Confidence,
  ): Prisma.GroceryDealMatchCreateWithoutBasketItemInput {
    return {
      dealId: deal.id,
      merchant: deal.merchant,
      title: deal.title,
      discount: this.discountLabel(deal),
      priceMinor,
      validUntil: deal.expiresAt,
      source: deal.source,
      lastVerifiedAt: deal.lastVerifiedAt,
      confidence: band,
      sourceUrl: deal.sourceUrl,
    };
  }

  private discountLabel(deal: Deal): string | null {
    if (
      deal.originalPriceMinor != null &&
      deal.currentPriceMinor != null &&
      deal.originalPriceMinor > 0n
    ) {
      const pct = Math.round(
        (1 - Number(deal.currentPriceMinor) / Number(deal.originalPriceMinor)) * 100,
      );
      if (pct > 0) return `${pct}% off`;
    }
    return deal.couponCode ?? null;
  }

  private storeRecData(
    best: StoreScore | null,
    second: StoreScore | null,
    input: GenerateBasketInput,
  ): Prisma.GroceryStoreRecommendationCreateWithoutBasketInput[] {
    const recs: Prisma.GroceryStoreRecommendationCreateWithoutBasketInput[] = [];
    if (best) {
      const pct = Math.round(best.itemMatchRate * 100);
      const underBudget = best.estimatedTotalMinor <= input.budgetMinor;
      recs.push({
        storeName: best.store.name,
        placeId: best.store.placeId,
        kind: 'best_single',
        score: best.score,
        estimatedTotalMinor: best.estimatedTotalMinor,
        estimatedSavingsMinor: best.estimatedSavingsMinor,
        distanceMiles: best.distanceMiles,
        latitude: best.store.latitude,
        longitude: best.store.longitude,
        reason: `Covers ${pct}% of your basket${underBudget ? ' under budget' : ''}`,
      });
    }
    if (second) {
      recs.push({
        storeName: second.store.name,
        placeId: second.store.placeId,
        kind: 'second_stop',
        score: second.score,
        estimatedTotalMinor: second.estimatedTotalMinor,
        estimatedSavingsMinor: second.estimatedSavingsMinor,
        distanceMiles: second.distanceMiles,
        latitude: second.store.latitude,
        longitude: second.store.longitude,
        reason: `Worth a stop to save $${(second.estimatedSavingsMinor / 100).toFixed(2)}`,
      });
    }
    return recs;
  }

  /**
   * Deterministic explanation, optionally upgraded by Gemini (best-effort).
   * Returns the text plus telemetry (`geminiUsed`, `cacheHit`) for logging.
   * AI is gated by AI_ENABLED + AiCache + RateLimiter + template fallback.
   */
  private async buildExplanation(args: {
    best: StoreScore | null;
    second: StoreScore | null;
    budgetMinor: number;
    estimatedTotalMinor: number;
    sourceStatus: string;
  }): Promise<{ text: string; geminiUsed: boolean; cacheHit: boolean }> {
    const template = this.templateExplanation(args);
    if (!this.geminiConfig.enabled || !args.best) {
      return { text: template, geminiUsed: false, cacheHit: false };
    }
    try {
      await this.rateLimiter.acquire();
      const { value, cacheHit } = await this.aiCache.getOrGenerate<{ explanation: string }>(
        {
          task: 'smart_basket_explanation',
          model: this.geminiConfig.model,
          schemaVersion: 'v1',
          prompt: `Rewrite this Smart Basket explanation in one friendly, concrete sentence for a college student. Keep all facts; do not invent deals. Base text: ${template}`,
        },
        () =>
          this.gemini.generateJson<{ explanation: string }>({
            model: this.geminiConfig.model,
            schema: {
              type: 'object',
              properties: { explanation: { type: 'string' } },
              required: ['explanation'],
            },
            prompt: `Rewrite this Smart Basket explanation in one friendly, concrete sentence for a college student. Keep all facts; do not invent deals. Base text: ${template}`,
          }),
      );
      const text = value?.explanation?.trim();
      return {
        text: text && text.length > 0 ? text : template,
        geminiUsed: true,
        cacheHit,
      };
    } catch {
      return { text: template, geminiUsed: false, cacheHit: false };
    }
  }

  private templateExplanation(args: {
    best: StoreScore | null;
    second: StoreScore | null;
    budgetMinor: number;
    estimatedTotalMinor: number;
    sourceStatus: string;
  }): string {
    if (!args.best) {
      return 'Not enough verified grocery deals here yet — this is an estimated basket from student staples and nearby stores.';
    }
    const pct = Math.round(args.best.itemMatchRate * 100);
    const underBudget = args.estimatedTotalMinor <= args.budgetMinor;
    let s = `${args.best.store.name} covers ${pct}% of your basket${underBudget ? ' under budget' : ''}.`;
    if (args.second) {
      s += ` ${args.second.store.name} is worth a quick second stop to save $${(args.second.estimatedSavingsMinor / 100).toFixed(2)}.`;
    }
    if (args.sourceStatus === 'estimated') {
      s += ' Prices are honest student-staple estimates, not verified deals.';
    }
    return s;
  }
}

/** Per-item assembly result before persistence. */
interface AssembledItem {
  item: BasketLineItem;
  storeName: string | null;
  priceMinor: number;
  estimateMinor: number;
  trustLabel: TrustLabel;
  band: Confidence;
  deal: Deal | null;
}
