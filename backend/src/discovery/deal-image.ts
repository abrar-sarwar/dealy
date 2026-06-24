/**
 * Validates and normalises a raw Open Graph image value scraped from Firecrawl
 * metadata.  Returns the trimmed URL string when it passes all checks, or null
 * when the value should be discarded to avoid surfacing junk images.
 *
 * Rejection rules (in evaluation order):
 *  1. Must be a non-empty string.
 *  2. Must parse as an absolute `https:` URL.
 *  3. Path must not match obvious non-hero assets:
 *     sprite, pixel, tracking, spacer, 1x1, favicon, logo (case-insensitive).
 *  4. Extension must not be `.svg`.
 */
export function validImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;

  const pathname = parsed.pathname.toLowerCase();

  if (/\.(svg)$/.test(pathname)) return null;

  if (/(sprite|pixel|tracking|spacer|1x1|favicon|logo)/i.test(pathname)) return null;

  return trimmed;
}
