export interface FirecrawlScrapeRequest {
  url: string;
  formats?: Array<'markdown' | 'html' | 'links' | 'screenshot' | 'json'>;
  onlyMainContent?: boolean;
}

export interface FirecrawlDocument {
  url?: string;
  markdown?: string;
  html?: string;
  links?: string[];
  metadata?: Record<string, unknown>;
  json?: unknown;
}

export interface FirecrawlCrawlRequest {
  url: string;
  limit?: number;
  scrapeOptions?: Partial<FirecrawlScrapeRequest>;
}

export interface FirecrawlExtractRequest {
  urls: string[];
  prompt?: string;
  schema?: Record<string, unknown>;
}

export class FirecrawlError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
  }
}
