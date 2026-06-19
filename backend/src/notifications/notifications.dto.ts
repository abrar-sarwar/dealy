import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DevicePlatformDto {
  ios = 'ios',
  android = 'android',
  web = 'web',
}

export class RegisterPushTokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ enum: DevicePlatformDto })
  @IsEnum(DevicePlatformDto)
  platform!: DevicePlatformDto;
}

export class UpdateNotificationPrefsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() newNearbyDeals?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() priceDrops?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() expiringSaved?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() watchedUpdates?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() studentDeals?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() eventReminders?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sponsored?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 23, description: 'Quiet-hours start (local hour)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStart?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 23 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEnd?: number;

  @ApiPropertyOptional({ example: 'America/New_York' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
