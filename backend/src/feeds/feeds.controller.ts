import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { NearbyFeedQuery, OnlineFeedQuery } from '../deals/deal.dto';
import { FeedsService } from './feeds.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { FeedPageQuery } from '../recommendations/recommendations.dto';
import { PlaceFeedService } from '../discovery/place-feed.service';

@ApiTags('feeds')
@Controller({ path: 'feeds', version: '1' })
export class FeedsController {
  constructor(
    private readonly feeds: FeedsService,
    private readonly recs: RecommendationsService,
    private readonly placeFeed: PlaceFeedService,
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

  @Public()
  @Get('missed')
  @ApiOperation({
    summary:
      'Recently-expired curated local deals (last 7 days), most-recent first — never redeemable',
  })
  missed(@Query() query: NearbyFeedQuery) {
    return this.feeds.missed(query);
  }

  @ApiBearerAuth('supabase')
  @Get('recommended')
  @ApiOperation({ summary: 'Personalized, explainable recommendations (with reasons)' })
  recommended(@CurrentUser() user: AuthUser, @Query() q: FeedPageQuery) {
    return this.recs.recommended(user.id, q.limit ?? 20, q.offset ?? 0);
  }

  @Public()
  @Get('places')
  @ApiOperation({
    summary:
      'Enriched-place feed sections for a region (cheap eats, hidden gems, etc.) — read-only, no live AI. ' +
      'Pass region, or lat+lng to resolve the nearest region automatically.',
  })
  async places(
    @Query('region') region?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    let resolved = region;
    if (!resolved && lat != null && lng != null) {
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        resolved = (await this.placeFeed.resolveRegion({ latitude, longitude })) ?? undefined;
      }
    }
    if (!resolved) return [];
    return this.placeFeed.sections(resolved);
  }

  @Public()
  @Get('trending')
  @ApiOperation({
    summary: 'Cross-campus trending deals (high-value/urgent, location-independent)',
  })
  trending(@Query() query: OnlineFeedQuery) {
    return this.feeds.trending(query);
  }
}
