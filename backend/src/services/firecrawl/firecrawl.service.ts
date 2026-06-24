import { Injectable, Logger } from '@nestjs/common';
import type { FirecrawlClient } from './firecrawl.client';
import type {
  FirecrawlCrawlRequest,
  FirecrawlDocument,
  FirecrawlExtractRequest,
  FirecrawlScrapeRequest,
} from './firecrawl.types';

@Injectable()
export class FirecrawlService {
  private readonly logger = new Logger(FirecrawlService.name);

  constructor(private readonly client: FirecrawlClient) {}

  async scrape(request: FirecrawlScrapeRequest): Promise<FirecrawlDocument> {
    const started = Date.now();
    try {
      const result = await this.client.scrape(request);
      this.logger.log({ url: request.url, latencyMs: Date.now() - started }, 'firecrawl.scrape');
      return result;
    } catch (err) {
      this.logger.warn(
        { url: request.url, err: (err as Error).message },
        'firecrawl.scrape.failed',
      );
      throw err;
    }
  }

  async crawl(request: FirecrawlCrawlRequest): Promise<unknown> {
    return this.client.crawl(request);
  }

  async extract(request: FirecrawlExtractRequest): Promise<unknown> {
    return this.client.extract(request);
  }
}
