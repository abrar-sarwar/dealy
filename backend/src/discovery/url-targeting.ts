/**
 * Resolve the exact URLs a source may be crawled at. Priority:
 *   1. explicit dealUrl (operator-verified deals page) — always wins;
 *   2. the seeded URL itself, IF its own path already matches an allowed target
 *      path (e.g. /savings/weekly-ad) — kept verbatim, never rewritten;
 *   3. origin + allowed targetPaths — for homepage sources only;
 *   4. otherwise [] — a bare domain is never crawled.
 * This ordering prevents rewriting a good seeded deep link (publix.com/savings/
 * weekly-ad) into a guessed shallow one (publix.com/weekly-ad).
 */
export function resolveCrawlTargets(input: {
  websiteUrl: string;
  dealUrl?: string | null;
  targetPaths?: string[];
  allowedPaths: string[];
}): string[] {
  if (input.dealUrl) return [input.dealUrl];

  const url = new URL(input.websiteUrl);
  const seededPathLooksTargeted = input.allowedPaths.some((p) => url.pathname.includes(p));
  if (seededPathLooksTargeted) return [input.websiteUrl];

  const synthesized: string[] = [];
  for (const path of input.targetPaths ?? []) {
    if (input.allowedPaths.includes(path)) synthesized.push(`${url.origin}${path}`);
  }
  return [...new Set(synthesized)];
}
