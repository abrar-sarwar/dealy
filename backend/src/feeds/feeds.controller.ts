import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { NearbyFeedQuery } from '../deals/deal.dto';
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

  @ApiBearerAuth('supabase')
  @Get('recommended')
  @ApiOperation({ summary: 'Personalized, explainable recommendations (with reasons)' })
  recommended(@CurrentUser() user: AuthUser, @Query() q: FeedPageQuery) {
    return this.recs.recommended(user.id, q.limit ?? 20, q.offset ?? 0);
  }

  @Public()
  @Get('trending')
  @ApiOperation({ summary: 'Trending deals by recent popularity' })
  trending(@Query() q: FeedPageQuery) {
    return this.recs.trending(q.limit ?? 20);
  }
}
