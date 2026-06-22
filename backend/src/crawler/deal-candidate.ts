export const LOW_GEOCODE_CONFIDENCE = 0.5;

export interface DealCandidate {
  title: string;
  merchant: string;
  categorySlug: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  startAt: Date | null;
  expiresAt: Date | null;
  sourceUrl: string;
  currentPriceMinor: bigint | null;
  couponCode: string | null;
  isStudentOnly: boolean;
  extractionPath: 'structured' | 'llm';
  geocodeConfidence: number; // 0–1
}

/**
 * Composite 0–100 confidence. Weighted: extraction path (structured beats llm),
 * required-field completeness, geocode confidence, and date validity. Pure +
 * deterministic so moderators get a stable triage signal.
 */
export function confidenceScore(c: DealCandidate): number {
  const pathScore = c.extractionPath === 'structured' ? 30 : 18;

  const required = [c.title, c.merchant, c.categorySlug, c.address];
  const present = required.filter((v) => v.trim().length > 0).length;
  const completeness = (present / required.length) * 30;

  const geo = Math.max(0, Math.min(1, c.geocodeConfidence)) * 25;

  const datesValid =
    c.expiresAt !== null &&
    c.expiresAt.getTime() > Date.now() &&
    (c.startAt === null || c.startAt.getTime() < c.expiresAt.getTime());
  const dateScore = datesValid ? 15 : 0;

  return Math.round(Math.max(0, Math.min(100, pathScore + completeness + geo + dateScore)));
}
