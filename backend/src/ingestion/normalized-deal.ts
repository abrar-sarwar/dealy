import { createHash } from 'node:crypto';

/** Provider-agnostic normalized deal (the common ingestion currency). */
export interface NormalizedDeal {
  externalId: string;
  title: string;
  merchant: string;
  categorySlug: string;
  shortDescription: string;
  detailedDescription: string;
  terms: string;
  currentPriceMinor: bigint | null;
  originalPriceMinor: bigint | null;
  currency: string;
  isOnline: boolean;
  isStudentOnly: boolean;
  couponCode: string | null;
  destinationUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  locationTags: string[];
  dealScore: number;
  visualSeed: number;
  startAt: Date | null;
  expiresAt: Date;
}

/**
 * A content provider. `isAvailable()` gates real providers behind credentials so
 * unrelated ingestion keeps working without them.
 */
export interface DealProvider {
  readonly name: string;
  isAvailable(): boolean;
  fetch(): Promise<NormalizedDeal[]>;
}

/**
 * Stable cross-source dedup fingerprint. Intentionally combines several fields
 * (merchant + title + location + price + category) — never title alone — so
 * lookalike titles don't collapse distinct deals.
 */
export function dealFingerprint(d: NormalizedDeal): string {
  const location = d.isOnline
    ? 'online'
    : (d.locationTags[0] ?? `${d.latitude ?? ''},${d.longitude ?? ''}`);
  const basis = [d.merchant, d.title, location, String(d.currentPriceMinor ?? ''), d.categorySlug]
    .map((s) => s.trim().toLowerCase())
    .join('|');
  return createHash('sha1').update(basis).digest('hex');
}

/** Throws on a record that must not be ingested. */
export function validateNormalizedDeal(d: NormalizedDeal, now = new Date()): void {
  if (!d.externalId.trim()) throw new Error('missing externalId');
  if (!d.title.trim()) throw new Error('missing title');
  if (!d.merchant.trim()) throw new Error('missing merchant');
  if (!d.categorySlug.trim()) throw new Error('missing category');
  if (d.expiresAt.getTime() <= now.getTime()) throw new Error('already expired');
  if (d.currentPriceMinor !== null && d.currentPriceMinor < 0n) throw new Error('negative price');
}
