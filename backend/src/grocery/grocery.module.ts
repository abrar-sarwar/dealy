import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { geminiConfig } from '../config/gemini';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryModule } from '../discovery/discovery.module';
import { PlaceFeedService } from '../discovery/place-feed.service';
import { AiCacheService } from '../discovery/ai-cache.service';
import { RateLimiter } from '../discovery/rate-limiter';
import { GeminiModule } from '../services/gemini/gemini.module';
import { GeminiClient } from '../services/gemini/gemini.client';
import { ThrottleModule } from '../common/throttle/throttle.module';
import { GroceryController } from './grocery.controller';
import { GroceryCatalogService } from './grocery-catalog.service';
import { BasketRecommendationService } from './basket-recommendation.service';
import { GroceryBasketService } from './grocery-basket.service';
import { FoodRunService } from './food-run.service';

@Module({
  imports: [PrismaModule, DiscoveryModule, GeminiModule, ThrottleModule],
  controllers: [GroceryController],
  providers: [
    GroceryCatalogService,
    BasketRecommendationService,
    {
      provide: FoodRunService,
      inject: [PrismaService, PlaceFeedService],
      useFactory: (prisma: PrismaService, placeFeed: PlaceFeedService) =>
        new FoodRunService(prisma, placeFeed),
    },
    {
      provide: GroceryBasketService,
      inject: [
        PrismaService,
        GroceryCatalogService,
        BasketRecommendationService,
        PlaceFeedService,
        GeminiClient,
        ConfigService,
      ],
      useFactory: (
        prisma: PrismaService,
        catalog: GroceryCatalogService,
        recommendation: BasketRecommendationService,
        placeFeed: PlaceFeedService,
        gemini: GeminiClient,
        config: ConfigService<Env, true>,
      ) => {
        const gc = geminiConfig(config);
        const aiCache = new AiCacheService(prisma, gc.cacheTtlHours);
        const rateLimiter = new RateLimiter(gc.enrichRatePerMin);
        return new GroceryBasketService(
          prisma,
          catalog,
          recommendation,
          placeFeed,
          gemini,
          aiCache,
          rateLimiter,
          gc,
        );
      },
    },
  ],
  exports: [
    GroceryBasketService,
    GroceryCatalogService,
    BasketRecommendationService,
    FoodRunService,
  ],
})
export class GroceryModule {}
