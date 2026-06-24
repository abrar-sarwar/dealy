import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firecrawlConfig } from '../../config/firecrawl';
import type { Env } from '../../config/env.schema';
import { FirecrawlClient } from './firecrawl.client';
import { FirecrawlService } from './firecrawl.service';

@Module({
  providers: [
    {
      provide: FirecrawlClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const fc = firecrawlConfig(config);
        return new FirecrawlClient({
          apiKey: fc.apiKey,
          apiUrl: fc.apiUrl,
          timeoutMs: fc.timeoutMs,
          maxRetries: 2,
        });
      },
    },
    FirecrawlService,
  ],
  exports: [FirecrawlClient, FirecrawlService],
})
export class FirecrawlModule {}
