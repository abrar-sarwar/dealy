import type { BasketEntity, GenerateBasketInput } from './grocery-basket.service';
import type {
  BasketDto,
  BasketItemDto,
  GenerateBasketDto,
  MatchedDealDto,
  StoreRecommendationDto,
  SubstitutionDto,
} from './grocery.dto';
import type { BasketGoal, BasketTimeframe, DietaryPreference } from './grocery.types';

/** Minor units (cents) → dollars. */
function dollars(minor: number): number {
  return Math.round(minor) / 100;
}

/** Coerce a Prisma Json value into a string[] (substitutions are stored as JSON). */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/** Map the wire request DTO → the service's normalised input (dollars → minor). */
export function toGenerateInput(dto: GenerateBasketDto): GenerateBasketInput {
  return {
    latitude: dto.latitude,
    longitude: dto.longitude,
    region: dto.region ?? null,
    campus: dto.campus ?? null,
    budgetMinor: Math.round(dto.budget * 100),
    goal: dto.goal as BasketGoal,
    timeframe: dto.timeframe as BasketTimeframe,
    dietary: (dto.dietary ?? []) as DietaryPreference[],
    excludedItems: dto.excludedItems ?? [],
    preferredStores: dto.preferredStores ?? [],
    maxDistanceMiles: dto.maxDistance ?? 10,
    allowSecondStop: dto.allowSecondStop ?? true,
  };
}

function mapStoreRec(
  rec: BasketEntity['storeRecs'][number] | undefined,
): StoreRecommendationDto | null {
  if (!rec) return null;
  return {
    name: rec.storeName,
    place_id: rec.placeId,
    kind: rec.kind,
    score: Math.round(rec.score * 100) / 100,
    estimated_total: dollars(rec.estimatedTotalMinor),
    estimated_savings: dollars(rec.estimatedSavingsMinor),
    distance_miles: rec.distanceMiles == null ? null : Math.round(rec.distanceMiles * 10) / 10,
    reason: rec.reason,
  };
}

function mapItem(item: BasketEntity['items'][number]): BasketItemDto {
  return {
    name: item.name,
    category: item.category,
    estimated_price: dollars(item.estimatedPriceMinor),
    quantity: item.quantity,
    unit: item.unit,
    store: item.storeName,
    matched_deal_id: item.matchedDealId,
    confidence: item.confidence,
    trust_label: item.trustLabel,
    substitution_options: toStringArray(item.substitutions),
  };
}

function mapMatchedDeal(
  match: NonNullable<BasketEntity['items'][number]['dealMatch']>,
): MatchedDealDto {
  return {
    merchant: match.merchant,
    title: match.title,
    discount: match.discount,
    price: dollars(match.priceMinor),
    valid_until: match.validUntil ? match.validUntil.toISOString() : null,
    source: match.source,
    last_verified_at: match.lastVerifiedAt ? match.lastVerifiedAt.toISOString() : null,
    confidence: match.confidence,
    source_url: match.sourceUrl,
  };
}

/** Map a persisted basket entity → the wire `BasketDto`. */
export function toBasketDto(entity: BasketEntity): BasketDto {
  const best = entity.storeRecs.find((r) => r.kind === 'best_single');
  const second = entity.storeRecs.find((r) => r.kind === 'second_stop');

  const matchedDeals: MatchedDealDto[] = entity.items
    .map((i) => i.dealMatch)
    .filter((m): m is NonNullable<typeof m> => m != null)
    .map(mapMatchedDeal);

  const substitutions: SubstitutionDto[] = entity.items
    .map((i) => ({ item: i.name, options: toStringArray(i.substitutions) }))
    .filter((s) => s.options.length > 0);

  return {
    basket_id: entity.id,
    title: entity.title,
    estimated_total: dollars(entity.estimatedTotalMinor),
    estimated_savings: dollars(entity.estimatedSavingsMinor),
    confidence: entity.confidence,
    source_status: entity.sourceStatus,
    explanation: entity.explanation,
    route_summary: entity.routeSummary,
    best_store: mapStoreRec(best),
    optional_second_store: mapStoreRec(second),
    items: entity.items.map(mapItem),
    matched_deals: matchedDeals,
    substitutions,
  };
}
