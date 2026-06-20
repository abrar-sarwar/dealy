import { IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  isOnline: boolean;
  isStudentOnly: boolean;
  shortDescription: string;
  detailedDescription: string;
  terms: string;
  couponCode: string | null;
  destinationUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  locationTags: string[];
  visualSeed: number;
  publishedAt: string;
  startAt: string | null;
  expiresAt: string;
}

export interface DealPage {
  items: DealDto[];
  nextCursor: string | null;
}

export class NearbyFeedQuery {
  @ApiProperty({ example: 33.7531 })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: -84.3857 })
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 5 })
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
