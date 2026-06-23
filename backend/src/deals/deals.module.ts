import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { FeedsController } from '../feeds/feeds.controller';
import { FeedsService } from '../feeds/feeds.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { CoverageModule } from '../coverage/coverage.module';

@Module({
  imports: [CoverageModule],
  controllers: [DealsController, FeedsController],
  providers: [DealsService, FeedsService, RecommendationsService],
  exports: [DealsService, FeedsService, RecommendationsService],
})
export class DealsModule {}
