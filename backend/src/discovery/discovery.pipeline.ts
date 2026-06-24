import type { FirecrawlDocument } from '../services/firecrawl/firecrawl.types';
import type { GeminiDeal } from '../services/gemini/gemini.types';

export interface DiscoverySource {
  id: string;
  url: string;
  regionSlug: string;
  merchantHint?: string;
  defaultCategorySlug?: string;
}

export interface NormalizedDiscoveryContent {
  source: DiscoverySource;
  document: FirecrawlDocument;
  contentHash: string;
  extractedText: string;
}

export interface DiscoveryPipelineResult {
  sourceId: string;
  regionSlug: string;
  contentHash: string;
  skippedGemini: boolean;
  candidates: GeminiDeal[];
  storedCandidateIds: string[];
}

export interface DiscoveryPipeline {
  discoverSources(regionSlug: string): Promise<DiscoverySource[]>;
  extractContent(source: DiscoverySource): Promise<NormalizedDiscoveryContent>;
  classifyContent(content: NormalizedDiscoveryContent): Promise<GeminiDeal[]>;
  storeResults(result: DiscoveryPipelineResult): Promise<void>;
}
