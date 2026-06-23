import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SwipeDirectionDto {
  left = 'left',
  right = 'right',
  up = 'up',
}

export class CreateSwipeDto {
  @ApiProperty({ enum: SwipeDirectionDto, description: 'right also saves the deal' })
  @IsEnum(SwipeDirectionDto)
  direction!: SwipeDirectionDto;
}

/**
 * Optional structured signals captured with an impression/open for the LATER
 * personalization phase. Whitelisted DTO: precise coordinates (latitude/
 * longitude) are intentionally NOT accepted — sending them is rejected. Distance
 * is bucketed server-side before storage.
 */
export class InteractionSignalsDto {
  @ApiPropertyOptional({ description: 'Distance to the deal at impression time (miles).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  distanceMiles?: number;

  @ApiPropertyOptional({ description: 'Deal price in minor units (cents).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinor?: number;

  @ApiPropertyOptional({ description: 'Category slug shown.' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Deal freshness in days at impression time.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freshnessDays?: number;
}
