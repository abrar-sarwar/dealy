export interface DiscoveryMetrics {
  firecrawlRequests: number;
  geminiRequests: number;
  cacheHits: number;
  cacheMisses: number;
  discoveredDeals: number;
  failedCrawls: number;
  verifiedDeals: number;
  processingLatencyMs: number;
}

export interface DiscoveryCostMetrics {
  firecrawlRequestsPerDeal: number;
  geminiRequestsPerDeal: number;
  cacheHitRate: number;
}

export function summarizeDiscoveryCosts(metrics: DiscoveryMetrics): DiscoveryCostMetrics {
  const deals = Math.max(metrics.discoveredDeals, 1);
  const cacheTotal = metrics.cacheHits + metrics.cacheMisses;
  return {
    firecrawlRequestsPerDeal: metrics.firecrawlRequests / deals,
    geminiRequestsPerDeal: metrics.geminiRequests / deals,
    cacheHitRate: cacheTotal === 0 ? 0 : metrics.cacheHits / cacheTotal,
  };
}
