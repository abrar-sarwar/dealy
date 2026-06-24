import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FirecrawlModule } from '../services/firecrawl/firecrawl.module';
import { GeminiModule } from '../services/gemini/gemini.module';
import { DiscoveryService } from './discovery.service';

@Module({
  imports: [PrismaModule, FirecrawlModule, GeminiModule],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
