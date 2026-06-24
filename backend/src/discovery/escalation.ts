/** Gemini Pro only for low-confidence extractions from reliable sources. */
export function shouldEscalateToPro(input: {
  confidence: number;
  reliabilityScore: number;
  maxConfidence: number;
  minReliability: number;
}): boolean {
  return input.confidence < input.maxConfidence && input.reliabilityScore > input.minReliability;
}

/** Cheap deterministic prefilter so Gemini is never asked to plan a source that
 *  is disabled or still inside its crawl interval. */
export function shouldConsiderSource(input: {
  enabled: boolean;
  lastCrawledAt: Date | null;
  crawlIntervalHours: number;
  now?: Date;
}): boolean {
  if (!input.enabled) return false;
  if (!input.lastCrawledAt) return true;
  const now = input.now ?? new Date();
  return now.getTime() - input.lastCrawledAt.getTime() >= input.crawlIntervalHours * 60 * 60 * 1000;
}
