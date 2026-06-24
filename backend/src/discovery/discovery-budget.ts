export interface FirecrawlBudgetLimits {
  maxPagesPerDay: number;
  maxPagesPerSourcePerDay: number;
  maxRecrawlsPerDay: number;
}

export interface FirecrawlBudgetUsage {
  pagesToday: number;
  pagesForSourceToday: number;
  /** Today's runs for THIS source whose fetch returned unchanged content. */
  recrawlsForSourceToday: number;
}

export type BudgetDenyReason = 'daily_page_cap' | 'source_page_cap' | 'recrawl_cap';

export interface BudgetDecision {
  allowed: boolean;
  reason?: BudgetDenyReason;
  remainingPages: number;
}

/**
 * Hard cost ceiling for Firecrawl, checked cheapest-cap-first. The recrawl cap
 * only bites when `sourceMayBeUnchanged` (we already hold a processed content
 * hash for this source, so another fetch is likely to come back unchanged) AND
 * this source has already produced `maxRecrawlsPerDay` unchanged fetches today.
 * "Unchanged" itself is decided post-fetch by the runner and recorded on
 * crawl_runs.unchanged — this function only consumes the counts.
 */
export function evaluateFirecrawlBudget(
  usage: FirecrawlBudgetUsage,
  limits: FirecrawlBudgetLimits,
  opts: { sourceMayBeUnchanged: boolean },
): BudgetDecision {
  if (usage.pagesToday >= limits.maxPagesPerDay)
    return { allowed: false, reason: 'daily_page_cap', remainingPages: 0 };
  if (usage.pagesForSourceToday >= limits.maxPagesPerSourcePerDay)
    return { allowed: false, reason: 'source_page_cap', remainingPages: 0 };
  if (opts.sourceMayBeUnchanged && usage.recrawlsForSourceToday >= limits.maxRecrawlsPerDay)
    return { allowed: false, reason: 'recrawl_cap', remainingPages: 0 };
  return {
    allowed: true,
    remainingPages: Math.min(
      limits.maxPagesPerDay - usage.pagesToday,
      limits.maxPagesPerSourcePerDay - usage.pagesForSourceToday,
    ),
  };
}
