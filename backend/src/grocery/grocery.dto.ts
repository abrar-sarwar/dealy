import {
  IsArray,
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const BASKET_GOALS = [
  'cheapest',
  'meal_prep',
  'high_protein',
  'dorm_snacks',
  'breakfast',
  'quick_meals',
  'healthy',
  'party',
  'custom',
] as const;

export const BASKET_TIMEFRAMES = ['today', '3_days', '1_week'] as const;

export const DIETARY_PREFERENCES = [
  'vegetarian',
  'halal',
  'high_protein',
  'low_prep',
  'no_cooking',
  'healthy',
  'bulk_value',
  'snacks_drinks',
] as const;

/** POST /v1/grocery/baskets/generate request (wire-contract camel/snake-agnostic). */
export class GenerateBasketDto {
  @ApiProperty({ example: 33.753 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: -84.386 })
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ description: 'Region slug; resolved from lat/lng when omitted' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Campus slug, e.g. gsu' })
  @IsOptional()
  @IsString()
  campus?: string;

  @ApiProperty({ example: 35, description: 'Budget in dollars' })
  @IsNumber()
  @Min(1)
  @Max(2000)
  budget!: number;

  @ApiProperty({ enum: BASKET_GOALS, example: 'high_protein' })
  @IsIn(BASKET_GOALS)
  goal!: (typeof BASKET_GOALS)[number];

  @ApiProperty({ enum: BASKET_TIMEFRAMES, example: '3_days' })
  @IsIn(BASKET_TIMEFRAMES)
  timeframe!: (typeof BASKET_TIMEFRAMES)[number];

  @ApiPropertyOptional({ enum: DIETARY_PREFERENCES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(DIETARY_PREFERENCES, { each: true })
  dietary?: (typeof DIETARY_PREFERENCES)[number][];

  @ApiPropertyOptional({ type: [String], example: ['pork'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedItems?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Aldi'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredStores?: string[];

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxDistance?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowSecondStop?: boolean;
}

/** A store recommendation in the response. */
export interface StoreRecommendationDto {
  name: string;
  place_id: string | null;
  kind: string; // best_single | second_stop
  score: number;
  estimated_total: number;
  estimated_savings: number;
  distance_miles: number | null;
  reason: string;
}

/** A single basket line in the response. */
export interface BasketItemDto {
  name: string;
  category: string;
  estimated_price: number;
  quantity: number;
  unit: string;
  store: string | null;
  matched_deal_id: string | null;
  confidence: string; // low | medium | high
  trust_label: string; // verified | source_backed | estimated | user_reported | mock
  substitution_options: string[];
}

/** A real matched grocery deal in the response. */
export interface MatchedDealDto {
  merchant: string;
  title: string;
  discount: string | null;
  price: number;
  valid_until: string | null;
  source: string;
  last_verified_at: string | null;
  confidence: string;
  source_url: string | null;
}

/** A suggested swap group. */
export interface SubstitutionDto {
  item: string;
  options: string[];
}

export const FOOD_RUN_INTENTS = [
  'under_10',
  'high_protein',
  'quick_lunch',
  'late_night',
  'study_spot',
  'date_friends',
  'closest_cheap',
] as const;

/** POST /v1/feeds/food-run request. */
export class FoodRunRequestDto {
  @ApiProperty({ example: 33.753 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: -84.386 })
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ description: 'Region slug; resolved from lat/lng when omitted' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ enum: FOOD_RUN_INTENTS, example: 'under_10' })
  @IsIn(FOOD_RUN_INTENTS)
  intent!: (typeof FOOD_RUN_INTENTS)[number];

  @ApiPropertyOptional({ example: 10, description: 'Budget in dollars' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(2000)
  budget?: number;
}

/** The chosen place inside a Cheap Food Run response. */
export interface FoodRunPlaceDto {
  id: string;
  name: string;
  category: string;
  price_bucket: string | null;
  rating: number | null;
  latitude: number;
  longitude: number;
  why_recommended: string | null;
  budget_tip: string | null;
  primary_photo_url: string | null;
}

/** Cheap Food Run response (wire `FoodRunDto`). */
export interface FoodRunDto {
  place: FoodRunPlaceDto | null;
  estimated_cost: number;
  reason: string;
  matched_deal: MatchedDealDto | null;
  confidence: string;
  source_status: string;
}

/** Full Smart Basket response (wire `BasketDto`). */
export interface BasketDto {
  basket_id: string;
  title: string;
  estimated_total: number;
  estimated_savings: number;
  confidence: string;
  source_status: string;
  explanation: string;
  route_summary: string | null;
  best_store: StoreRecommendationDto | null;
  optional_second_store: StoreRecommendationDto | null;
  items: BasketItemDto[];
  matched_deals: MatchedDealDto[];
  substitutions: SubstitutionDto[];
}
