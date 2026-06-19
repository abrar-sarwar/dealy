import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum SearchSort {
  relevance = 'relevance',
  newest = 'newest',
  savings = 'savings',
  priceLow = 'priceLow',
  endingSoon = 'endingSoon',
}

const toBool = ({ value }: { value: unknown }): unknown =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

export class SearchQueryDto {
  @ApiPropertyOptional({ description: 'Full-text query' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Category slug' })
  @IsOptional()
  @Matches(/^[a-zA-Z]+$/, { message: 'category must be a slug' })
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  online?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  student?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Minimum discount %' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minDiscount?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Max current price (dollars)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: SearchSort })
  @IsOptional()
  @IsEnum(SearchSort)
  sort?: SearchSort;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
