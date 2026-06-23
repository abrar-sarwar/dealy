import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { NearbyFeedQuery, OnlineFeedQuery } from '../deals/deal.dto';
import { FeedsService } from './feeds.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { FeedPageQuery } from '../recommendations/recommendations.dto';

@ApiTags('feeds')
@Controller({ path: 'feeds', version: '1' })
export class FeedsController {
  constructor(
    private readonly feeds: FeedsService,
    private readonly recs: RecommendationsService,
  ) {}

  // Public deal browsing.
  @Public()
  @Get('nearby')
  @ApiOperation({ summary: 'Published deals near a point, sorted by distance (cursor paginated)' })
  nearby(@Query() query: NearbyFeedQuery) {
    return this.feeds.nearby(query);
  }

  @Public()
  @Get('online')
  @ApiOperation({ summary: 'Active online-only deals, newest first (cursor paginated)' })
  online(@Query() query: OnlineFeedQuery) {
    return this.feeds.online(query);
  }

  @Public()
  @Get('student')
  @ApiOperation({ summary: 'Curated national student programs, newest first (cursor paginated)' })
  student(@Query() query: OnlineFeedQuery) {
    return this.feeds.student(query);
  }

  @Public()
  @Get('local')
  @ApiOperation({ summary: 'Curated local deals within radius (default 15mi), nearest first' })
  local(@Query() query: NearbyFeedQuery) {
    return this.feeds.local(query);
  }

  @ApiBearerAuth('supabase')
  @Get('recommended')
  @ApiOperation({ summary: 'Personalized, explainable recommendations (with reasons)' })
  recommended(@CurrentUser() user: AuthUser, @Query() q: FeedPageQuery) {
    return this.recs.recommended(user.id, q.limit ?? 20, q.offset ?? 0);
  }

  @Public()
  @Get('trending')
  @ApiOperation({ summary: 'Cross-campus trending deals (high-value/urgent, location-independent)' })
  trending(@Query() query: OnlineFeedQuery) {
    return this.feeds.trending(query);
  }
}
