import {
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class ModerationQueueQuery {
  @IsOptional() @IsString() source?: string; // crawlSourceId
  @IsOptional() @IsString() category?: string; // category slug
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}
export class RejectDto {
  @IsString() @MaxLength(280) reason!: string;
}
export class ModerationEditDto {
  @IsOptional() @IsString() @MaxLength(140) title?: string;
  @IsOptional() @IsString() @MaxLength(140) merchant?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsISO8601() startAt?: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
}
