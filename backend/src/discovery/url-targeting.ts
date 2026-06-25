/**
 * Resolve the exact URLs a source may be crawled at. Priority:
 *   1. explicit dealUrl (operator-verified deals page) — always wins;
 *   2. the seeded URL itself, IF its own path already matches an allowed target
 *      path (e.g. /savings/weekly-ad) — kept verbatim, never rewritten;
 *   3. origin + the source's own targetPaths (filtered to the allowlist) — for
 *      homepage sources that declare which paths to try;
 *   4. origin + the FULL allowlist — for place-sourced homepages that declare no
 *      targetPaths (targetPaths=[]), so the most likely deal pages are tried;
 *   5. otherwise [] — a bare domain with no allowed paths is never crawled.
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

  // A source's declared targetPaths win when present (filtered to the allowlist);
  // otherwise fall back to synthesizing the full allowlist — this is the
  // place-enrollment path, where sources are seeded with targetPaths=[].
  const declared = input.targetPaths ?? [];
  const paths =
    declared.length > 0
      ? declared.filter((p) => input.allowedPaths.includes(p))
      : input.allowedPaths;
  const synthesized = paths.map((path) => `${url.origin}${path}`);
  return [...new Set(synthesized)];
}
