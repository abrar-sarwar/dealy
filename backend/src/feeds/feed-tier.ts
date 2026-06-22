/**
 * Public trust tier surfaced to clients and used for feed ranking. DERIVED, never
 * stored — computed from provenance + verification + moderation so it can never
 * drift out of sync. Mirrored as SQL in FEED_TIER_CASE_SQL for feed ordering.
 *
 * Rank: verified(0) < curated(1) < online(2) < community(3).
 * "Verified" stays authoritative-only. COMMUNITY is the reserved fallback bucket
 * (no ingest path yet); anything not matching a real tier lands here.
 */
export type FeedTier = 'verified' | 'curated' | 'online' | 'community';

export interface FeedTierInput {
  sourceTrust: string;
  verificationStatus: string;
  moderationStatus: string;
  status: string;
  isOnline: boolean;
}

export function deriveFeedTier(d: FeedTierInput): FeedTier {
  const verified = d.verificationStatus === 'verified';
  if (d.sourceTrust === 'authoritative' && verified) {
    return d.isOnline ? 'online' : 'verified';
  }
  if (
    d.sourceTrust === 'editorial' &&
    d.moderationStatus === 'approved' &&
    d.status === 'published'
  ) {
    return 'curated';
  }
  return 'community';
}

const RANK: Record<FeedTier, 0 | 1 | 2 | 3> = {
  verified: 0,
  curated: 1,
  online: 2,
  community: 3,
};

export function feedTierRank(tier: FeedTier): 0 | 1 | 2 | 3 {
  return RANK[tier];
}

/**
 * SQL expression yielding the same 0–3 rank as feedTierRank(deriveFeedTier(...)).
 * Inline-able into ORDER BY / SELECT. Assumes the `deals` table aliased as `d`.
 */
export const FEED_TIER_CASE_SQL = `
  CASE
    WHEN d.source_trust = 'authoritative' AND d.verification_status = 'verified' AND d.is_online = false THEN 0
    WHEN d.source_trust = 'editorial' AND d.moderation_status = 'approved' AND d.status = 'published' THEN 1
    WHEN d.source_trust = 'authoritative' AND d.verification_status = 'verified' AND d.is_online = true THEN 2
    ELSE 3
  END`;
