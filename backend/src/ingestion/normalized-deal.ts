import { createHash } from 'node:crypto';

/**
 * Pilot-eligible categories for the Atlanta verified-inventory launch
 * (Food, Groceries, Local events). `entertainment` is the taxonomy slug that
 * backs "Local events" (Ticketmaster maps to it). Coverage qualification counts
 * only deals in these categories. The taxonomy itself is unchanged.
 */
export const PILOT_CATEGORIES = ['food', 'groceries', 'entertainment'] as const;
export type PilotCategory = (typeof PILOT_CATEGORIES)[number];
export function isPilotCategory(slug: string): slug is PilotCategory {
  return (PILOT_CATEGORIES as readonly string[]).includes(slug);
}

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
  /** Provenance: canonical URL/identifier the offer was confirmed against. */
  sourceUrl: string | null;
  /** Human-facing attribution string required by some providers. */
  providerAttribution: string | null;
}

/** The minimal deal shape a provider needs to re-verify an offer at its source. */
export interface VerifiableDeal {
  externalId: string;
  expiresAt: Date;
}

/**
 * Outcome of re-checking a deal against its authoritative source.
 * - `confirmed`   — source still offers it (optionally with a refreshed expiry).
 * - `invalid`     — source no longer offers it; remove from active feeds now.
 * - `expired`     — source marks it expired/past; expire now.
 * - `unreachable` — transient provider failure; distinct from `invalid` so a
 *                   short grace policy can apply (never overrides invalid/expired).
 */
export type VerificationOutcomeStatus = 'confirmed' | 'invalid' | 'expired' | 'unreachable';
export interface VerificationResult {
  status: VerificationOutcomeStatus;
  reason?: string;
  /** Refreshed expiry when the source moved/extended the offer. */
  expiresAt?: Date;
}

/**
 * A content provider. `isAvailable()` gates real providers behind credentials so
 * unrelated ingestion keeps working without them. `verify()` re-checks a single
 * deal against the source for the daily re-verification job; providers that
 * cannot re-check individually may omit it (treated as `unreachable`).
 */
export interface DealProvider {
  readonly name: string;
  isAvailable(): boolean;
  fetch(): Promise<NormalizedDeal[]>;
  verify?(deal: VerifiableDeal): Promise<VerificationResult>;
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
