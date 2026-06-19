import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { FeedsController } from '../feeds/feeds.controller';
import { FeedsService } from '../feeds/feeds.service';
import { RecommendationsService } from '../recommendations/recommendations.service';

@Module({
  controllers: [DealsController, FeedsController],
  providers: [DealsService, FeedsService, RecommendationsService],
  exports: [DealsService, FeedsService, RecommendationsService],
})
export class DealsModule {}
