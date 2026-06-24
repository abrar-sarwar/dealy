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
import { DiscoveryService } from './discovery.service';
import { AiCacheService } from './ai-cache.service';
import { FirecrawlBudgetService } from './firecrawl-budget.service';
import { DiscoveryRunnerService, type DiscoveryRunnerConfig } from './discovery-runner.service';
import { CandidatePromotionService } from './candidate-promotion.service';
import { DiscoverySchedulerService } from './discovery.scheduler';

@Module({
  imports: [PrismaModule, SearchModule, FirecrawlModule, GeminiModule],
  providers: [
    DiscoveryService,
    {
      provide: AiCacheService,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService<Env, true>) =>
        new AiCacheService(prisma, geminiConfig(config).cacheTtlHours),
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
        new CandidatePromotionService(prisma, search, discoveryConfig(config).publishMinConfidence),
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
        ConfigService,
      ],
      useFactory: (
        prisma: PrismaService,
        discovery: DiscoveryService,
        budget: FirecrawlBudgetService,
        firecrawl: FirecrawlService,
        gemini: GeminiService,
        aiCache: AiCacheService,
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
          runnerConfig,
        );
      },
    },
    DiscoverySchedulerService,
  ],
  exports: [DiscoveryService, DiscoveryRunnerService, CandidatePromotionService],
})
export class DiscoveryModule {}
