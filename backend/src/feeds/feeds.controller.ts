import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { NearbyFeedQuery, OnlineFeedQuery } from '../deals/deal.dto';
import { FeedsService } from './feeds.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { FeedPageQuery } from '../recommendations/recommendations.dto';
import { PlaceFeedService } from '../discovery/place-feed.service';
import { FoodRunService } from '../grocery/food-run.service';
import { FoodRunRequestDto } from '../grocery/grocery.dto';

@ApiTags('feeds')
@Controller({ path: 'feeds', version: '1' })
export class FeedsController {
  constructor(
    private readonly feeds: FeedsService,
    private readonly recs: RecommendationsService,
    private readonly placeFeed: PlaceFeedService,
    private readonly foodRunService: FoodRunService,
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
  @Get('places/map')
  @ApiOperation({
    summary:
      'Map-ready place markers near a point: bounded (default ~40), with markerKind + keyless ' +
      'primaryPhotoUrl. Read-only, no live AI or photo fetching. Pass lat+lng (resolves region), ' +
      'optional radiusMiles, optional limit.',
  })
  async placesMap(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusMiles') radiusMiles?: string,
    @Query('limit') limit?: string,
    @Query('region') region?: string,
  ) {
    const latitude = lat != null ? Number(lat) : NaN;
    const longitude = lng != null ? Number(lng) : NaN;
    const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude);

    let resolved = region;
    if (!resolved && hasPoint) {
      resolved = (await this.placeFeed.resolveRegion({ latitude, longitude })) ?? undefined;
    }
    if (!resolved) return [];

    const radius = radiusMiles != null ? Number(radiusMiles) : undefined;
    const lim = limit != null ? Number(limit) : undefined;
    return this.placeFeed.mapMarkers(resolved, {
      center: hasPoint ? { latitude, longitude } : undefined,
      radiusMiles: Number.isFinite(radius) ? radius : undefined,
      limit: Number.isFinite(lim) ? lim : undefined,
    });
  }

  @Public()
  @Get('trending')
  @ApiOperation({
    summary: 'Cross-campus trending deals (high-value/urgent, location-independent)',
  })
  trending(@Query() query: OnlineFeedQuery) {
    return this.feeds.trending(query);
  }

  @Public()
  @Post('food-run')
  @ApiOperation({
    summary:
      'Cheap Food Run: the single best place to eat right now for an intent ' +
      '(under_10, study_spot, etc.) with estimated cost, reason, budget tip, and an ' +
      'optional matched restaurant deal. Read-only over stored Places — no live AI.',
  })
  foodRun(@Body() body: FoodRunRequestDto) {
    return this.foodRunService.bestPlace({
      latitude: body.latitude,
      longitude: body.longitude,
      region: body.region ?? null,
      intent: body.intent,
      budgetMinor: body.budget != null ? Math.round(body.budget * 100) : null,
    });
  }
}
