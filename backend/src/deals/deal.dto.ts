import { IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { FeedTier } from '../feeds/feed-tier';

/** Public deal shape returned by feeds + detail. Maps 1:1 to the iOS `DealDTO`. */
export interface DealDto {
  id: string;
  title: string;
  merchant: string;
  category: string; // category slug == iOS DealCategory rawValue
  currentPrice: number; // dollars
  originalPrice: number; // dollars
  currency: string;
  savingsAmount: number;
  savingsPercentage: number;
  distanceMiles: number | null;
  dealScore: number;
  /** Server-controlled trust signal: Dealy recently confirmed this deal through
   * its authoritative source. NEVER derived from a client-supplied value. */
  verified: boolean;
  verifiedAt: string | null;
  /** Derived display/ranking tier (verified|curated|online|community). */
  trustLevel: FeedTier;
  /** Crawler confidence (0–100) for curated deals; null otherwise. */
  confidenceScore: number | null;
  isOnline: boolean;
  isStudentOnly: boolean;
  /** Derived: an exceptional (high-value or urgent) verified deal, featured
   * across all campuses. Computed at map time; never stored. */
  isTrending: boolean;
  shortDescription: string;
  detailedDescription: string;
  terms: string;
  couponCode: string | null;
  destinationUrl: string | null;
  /** Brand to search for physical redemption (e.g. "Apple Store"); null = online-only. */
  redemptionBrand: string | null;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: string;
  locationTags: string[];
  visualSeed: number;
  /** Hero image URL scraped from the deal page's Open Graph metadata. Null if
   * no valid image was captured at crawl time. */
  imageUrl: string | null;
  publishedAt: string;
  startAt: string | null;
  expiresAt: string;
}

export interface DealPage {
  items: DealDto[];
  nextCursor: string | null;
}

/** Machine-readable Nearby coverage status (density-first rollout). */
export interface NearbyCoverage {
  qualified: boolean;
  reason: 'qualified' | 'outside_coverage' | 'low_coverage';
  zoneSlug: string | null;
}

/** Nearby feed response: a trust-tier-ranked blend (verified > curated > online)
 * that is never empty when any inventory exists in range. `coverage` reports the
 * zone's density status (honesty signal); `blend` reports the radius used and
 * which tiers were included. */
export interface NearbyDealPage extends DealPage {
  coverage: NearbyCoverage;
  /** How the never-empty ladder assembled this page (honesty signal). */
  blend: { radiusMilesUsed: number; tiersIncluded: FeedTier[] };
}

export class NearbyFeedQuery {
  @ApiProperty({ example: 33.7531 })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: -84.3857 })
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  radiusMiles?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque pagination cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Filter by category slug' })
  @IsOptional()
  @IsString()
  category?: string;
}

/** Query for the online-only deals feed (no geography; recency-paginated). */
export class OnlineFeedQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque pagination cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
