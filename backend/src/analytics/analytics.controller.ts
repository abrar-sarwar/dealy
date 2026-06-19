import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { AnalyticsService } from './analytics.service';
import { DealyEvent } from './events';

export class TrackEventDto {
  @IsEnum(DealyEvent)
  event!: DealyEvent;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

@ApiTags('analytics')
@ApiBearerAuth('supabase')
@Controller({ version: '1' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Record a client analytics event (distinctId = current user)' })
  track(@CurrentUser() user: AuthUser, @Body() dto: TrackEventDto): { accepted: true } {
    this.analytics.track(dto.event, user.id, dto.properties ?? {});
    return { accepted: true };
  }
}
