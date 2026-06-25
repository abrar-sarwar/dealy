import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { discoveryConfig } from '../config/discovery';
import { firecrawlConfig } from '../config/firecrawl';
import { geminiConfig } from '../config/gemini';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { SearchModule } from '../search/search.module';
import { SearchIndexer } from '../search/search-indexer.service';
import { FirecrawlModule } from '../services/firecrawl/firecrawl.module';
import { FirecrawlService } from '../services/firecrawl/firecrawl.service';
import { GeminiModule } from '../services/gemini/gemini.module';
import { GeminiService } from '../services/gemini/gemini.service';
import { GooglePlacesService } from '../services/google-places/google-places.service';
import { geocoderProvider } from '../crawler/geocoding/geocoder.provider';
import { GEOCODER, type Geocoder } from '../crawler/geocoding/geocoder';
import { DiscoveryService } from './discovery.service';
import { AiCacheService } from './ai-cache.service';
import { FirecrawlBudgetService } from './firecrawl-budget.service';
import { DiscoveryRunnerService, type DiscoveryRunnerConfig } from './discovery-runner.service';
import { MerchantLocationResolver } from './merchant-location.resolver';
import { CandidatePromotionService } from './candidate-promotion.service';
import { DiscoverySchedulerService } from './discovery.scheduler';
import { PlaceDiscoveryService } from './place-discovery.service';
import { PlaceCrawlEnrollmentService } from './place-crawl-enrollment.service';
import { PlaceEnrichmentService, type EnrichmentConfig } from './place-enrichment.service';
import { PlaceFeedService } from './place-feed.service';
import { GeminiClient } from '../services/gemini/gemini.client';

@Module({
  imports: [PrismaModule, SearchModule, FirecrawlModule, GeminiModule],
  providers: [
    DiscoveryService,
    geocoderProvider,
    {
      provide: AiCacheService,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService<Env, true>) =>
        new AiCacheService(prisma, geminiConfig(config).cacheTtlHours),
    },
    {
      provide: GooglePlacesService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => new GooglePlacesService(config),
    },
    {
      provide: MerchantLocationResolver,
      inject: [GooglePlacesService, GEOCODER, AiCacheService],
      useFactory: (places: GooglePlacesService, geocoder: Geocoder, aiCache: AiCacheService) =>
        new MerchantLocationResolver(places, geocoder, aiCache),
    },
    {
      provide: FirecrawlBudgetService,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService<Env, true>) => {
        const fc = firecrawlConfig(config);
        return new FirecrawlBudgetService(prisma, {
          maxPagesPerDay: fc.maxPagesPerDay,
          maxPagesPerSourcePerDay: fc.maxPagesPerSourcePerDay,
          maxRecrawlsPerDay: fc.maxRecrawlsPerDay,
        });
      },
    },
    {
      provide: CandidatePromotionService,
      inject: [PrismaService, SearchIndexer, ConfigService],
      useFactory: (
        prisma: PrismaService,
        search: SearchIndexer,
        config: ConfigService<Env, true>,
      ) =>
        new CandidatePromotionService(
          prisma,
          search,
          discoveryConfig(config).publishMinConfidence,
          discoveryConfig(config).publishMinQuality,
        ),
    },
    {
      provide: DiscoveryRunnerService,
      inject: [
        PrismaService,
        DiscoveryService,
        FirecrawlBudgetService,
        FirecrawlService,
        GeminiService,
        AiCacheService,
        MerchantLocationResolver,
        ConfigService,
      ],
      useFactory: (
        prisma: PrismaService,
        discovery: DiscoveryService,
        budget: FirecrawlBudgetService,
        firecrawl: FirecrawlService,
        gemini: GeminiService,
        aiCache: AiCacheService,
        resolver: MerchantLocationResolver,
        config: ConfigService<Env, true>,
      ) => {
        const gc = geminiConfig(config);
        const dc = discoveryConfig(config);
        const runnerConfig: DiscoveryRunnerConfig = {
          gemini: {
            model: gc.model,
            reasoningModel: gc.reasoningModel,
            escalationMaxConfidence: gc.escalationMaxConfidence,
            escalationMinReliability: gc.escalationMinReliability,
          },
          targetPaths: dc.targetPaths,
        };
        return new DiscoveryRunnerService(
          prisma,
          discovery,
          budget,
          firecrawl,
          gemini,
          aiCache,
          resolver,
          runnerConfig,
        );
      },
    },
    DiscoverySchedulerService,
    {
      provide: PlaceDiscoveryService,
      inject: [PrismaService, GooglePlacesService],
      useFactory: (prisma: PrismaService, places: GooglePlacesService) =>
        new PlaceDiscoveryService(prisma, places),
    },
    {
      provide: PlaceCrawlEnrollmentService,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PlaceCrawlEnrollmentService(prisma),
    },
    {
      provide: PlaceEnrichmentService,
      inject: [PrismaService, GeminiClient, AiCacheService, ConfigService],
      useFactory: (
        prisma: PrismaService,
        client: GeminiClient,
        aiCache: AiCacheService,
        config: ConfigService<Env, true>,
      ) => {
        const gc = geminiConfig(config);
        const cfg: EnrichmentConfig = {
          model: gc.model,
          ratePerMin: gc.enrichRatePerMin,
          batchSize: gc.enrichBatchSize,
          maxRetries: gc.enrichMaxRetries,
          enabled: gc.enabled,
        };
        return new PlaceEnrichmentService(prisma, client, aiCache, cfg);
      },
    },
    {
      provide: PlaceFeedService,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PlaceFeedService(prisma),
    },
  ],
  exports: [
    DiscoveryService,
    DiscoveryRunnerService,
    CandidatePromotionService,
    PlaceDiscoveryService,
    PlaceCrawlEnrollmentService,
    PlaceEnrichmentService,
    PlaceFeedService,
  ],
})
export class DiscoveryModule {}
