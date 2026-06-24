export interface RankingSignals {
  distanceScore: number;
  discountScore: number;
  freshnessScore: number;
  verificationScore: number;
  popularityScore: number;
  confidenceScore: number;
}

const WEIGHTS: Record<keyof RankingSignals, number> = {
  distanceScore: 0.2,
  discountScore: 0.2,
  freshnessScore: 0.15,
  verificationScore: 0.2,
  popularityScore: 0.1,
  confidenceScore: 0.15,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function rankDealCandidate(signals: RankingSignals): number {
  const score = (Object.keys(WEIGHTS) as (keyof RankingSignals)[]).reduce(
    (sum, key) => sum + clamp01(signals[key]) * WEIGHTS[key],
    0,
  );
  return Math.round(score * 100);
}
