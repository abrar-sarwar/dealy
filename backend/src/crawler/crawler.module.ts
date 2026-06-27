// src/crawler/crawler.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { CrawlerService } from './crawler.service';
import { SourceFetcher } from './source-fetcher';
import { RobotsChecker } from './robots-checker';
import { StructuredExtractor } from './extractors/structured-extractor';
import { LlmExtractor } from './extractors/llm-extractor';
import { geocoderProvider } from './geocoding/geocoder.provider';

@Module({
  imports: [PrismaModule, SearchModule, ConfigModule],
  providers: [
    {
      // robots.txt-aware fetcher; respect toggled by CRAWLER_RESPECT_ROBOTS (BH7).
      provide: SourceFetcher,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new SourceFetcher(
          fetch,
          new RobotsChecker(),
          config.get('CRAWLER_RESPECT_ROBOTS', { infer: true }),
        ),
    },
    CrawlerService,
    StructuredExtractor,
    geocoderProvider,
    {
      provide: LlmExtractor,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new LlmExtractor({ apiKey: config.get('ANTHROPIC_API_KEY', { infer: true }) }),
    },
  ],
  exports: [CrawlerService],
})
export class CrawlerModule {}
