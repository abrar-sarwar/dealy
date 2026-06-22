// src/crawler/crawler.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { CrawlerService } from './crawler.service';
import { SourceFetcher } from './source-fetcher';
import { StructuredExtractor } from './extractors/structured-extractor';
import { LlmExtractor } from './extractors/llm-extractor';
import { geocoderProvider } from './geocoding/geocoder.provider';

@Module({
  imports: [PrismaModule, SearchModule, ConfigModule],
  providers: [
    CrawlerService,
    SourceFetcher,
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
