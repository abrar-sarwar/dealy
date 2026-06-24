import type { Deal, Category } from '@prisma/client';
import type { DealDto } from './deal.dto';
import { deriveFeedTier } from '../feeds/feed-tier';

/** Minor units (cents) → dollars as a JS number. Never floating-point math on storage. */
function minorToDollars(minor: bigint | null): number {
  if (minor === null) return 0;
  return Number(minor) / 100;
}

/** Hours within which an offer counts as "ending soon" for trending. */
const TRENDING_URGENCY_HOURS = 48;
/** Minimum percent off for a non-urgent deal to trend. */
const TRENDING_MIN_PERCENT = 50;

/**
 * A deal trends (is featured cross-campus to every supported campus) when it is
 * authoritative + verified AND exceptional: a strong discount OR ending soon.
 * Pure + deterministic; derived at map time, never stored.
 */
export function deriveTrending(input: {
  sourceTrust: string;
  verificationStatus: string;
  savingsPercentage: number;
  expiresAt: Date;
  now?: Date;
}): boolean {
  if (input.sourceTrust !== 'authoritative' || input.verificationStatus !== 'verified')
    return false;
  const now = input.now ?? new Date();
  const msToExpiry = input.expiresAt.getTime() - now.getTime();
  const endingSoon = msToExpiry > 0 && msToExpiry <= TRENDING_URGENCY_HOURS * 3600 * 1000;
  return input.savingsPercentage >= TRENDING_MIN_PERCENT || endingSoon;
}

/** Normalized inputs shared by the Prisma-row and raw-SQL-row mappers. */
interface NormalizedDeal {
  id: string;
  title: string;
  merchant: string;
  categorySlug: string;
  shortDescription: string;
  detailedDescription: string;
  terms: string;
  currentPriceMinor: bigint | null;
  originalPriceMinor: bigint | null;
  currency: string;
  dealScore: number;
  isOnline: boolean;
  isStudentOnly: boolean;
  couponCode: string | null;
  destinationUrl: string | null;
  redemptionBrand: string | null;
  latitude: number | null;
  longitude: number | null;
  locationTags: string[];
  visualSeed: number;
  verificationStatus: string;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  startAt: Date | null;
  expiresAt: Date;
  sourceTrust: string;
  moderationStatus: string;
  status: string;
  confidenceScore: number | null;
}

function toDealDto(n: NormalizedDeal, distanceMiles: number | null): DealDto {
  const currentPrice = minorToDollars(n.currentPriceMinor);
  const originalPrice = minorToDollars(n.originalPriceMinor);
  const savingsAmount = Math.max(originalPrice - currentPrice, 0);
  const savingsPercentage =
    originalPrice > 0 ? Math.round((savingsAmount / originalPrice) * 100) : 0;

  return {
    id: n.id,
    title: n.title,
    merchant: n.merchant,
    category: n.categorySlug,
    currentPrice,
    originalPrice,
    currency: n.currency,
    savingsAmount,
    savingsPercentage,
    distanceMiles: distanceMiles === null ? null : Math.round(distanceMiles * 10) / 10,
    dealScore: n.dealScore,
    verified: n.verificationStatus === 'verified',
    verifiedAt: n.lastVerifiedAt ? n.lastVerifiedAt.toISOString() : null,
    isOnline: n.isOnline,
    isStudentOnly: n.isStudentOnly,
    shortDescription: n.shortDescription,
    detailedDescription: n.detailedDescription,
    terms: n.terms,
    couponCode: n.couponCode,
    destinationUrl: n.destinationUrl,
    redemptionBrand: n.redemptionBrand,
    latitude: n.latitude,
    longitude: n.longitude,
    locationTags: n.locationTags,
    visualSeed: n.visualSeed,
    publishedAt: n.createdAt.toISOString(),
    startAt: n.startAt ? n.startAt.toISOString() : null,
    expiresAt: n.expiresAt.toISOString(),
    trustLevel: deriveFeedTier({
      sourceTrust: n.sourceTrust,
      verificationStatus: n.verificationStatus,
      moderationStatus: n.moderationStatus,
      status: n.status,
      isOnline: n.isOnline,
    }),
    confidenceScore: n.confidenceScore,
    isTrending: deriveTrending({
      sourceTrust: n.sourceTrust,
      verificationStatus: n.verificationStatus,
      savingsPercentage,
      expiresAt: n.expiresAt,
    }),
  };
}

/** Map a Prisma deal (with its category relation) — used by deal detail. */
export function mapPrismaDeal(deal: Deal & { category: Category }, distanceMiles: number | null) {
  return toDealDto(
    {
      id: deal.id,
      title: deal.title,
      merchant: deal.merchant,
      categorySlug: deal.category.slug,
      shortDescription: deal.shortDescription,
      detailedDescription: deal.detailedDescription,
      terms: deal.terms,
      currentPriceMinor: deal.currentPriceMinor,
      originalPriceMinor: deal.originalPriceMinor,
      currency: deal.currency,
      dealScore: deal.dealScore,
      isOnline: deal.isOnline,
      isStudentOnly: deal.isStudentOnly,
      couponCode: deal.couponCode,
      destinationUrl: deal.destinationUrl,
      redemptionBrand: deal.redemptionBrand,
      latitude: deal.latitude,
      longitude: deal.longitude,
      locationTags: deal.locationTags,
      visualSeed: deal.visualSeed,
      verificationStatus: deal.verificationStatus,
      lastVerifiedAt: deal.lastVerifiedAt,
      createdAt: deal.createdAt,
      startAt: deal.startAt,
      expiresAt: deal.expiresAt,
      sourceTrust: deal.sourceTrust,
      moderationStatus: deal.moderationStatus,
      status: deal.status,
      confidenceScore: deal.confidenceScore,
    },
    distanceMiles,
  );
}

/** Raw row returned by the nearby PostGIS query (snake_case + distance_meters). */
export interface NearbyRow {
  id: string;
  title: string;
  merchant: string;
  category_slug: string;
  short_description: string;
  detailed_description: string;
  terms: string;
  current_price_minor: bigint | null;
  original_price_minor: bigint | null;
  currency: string;
  deal_score: number;
  is_online: boolean;
  is_student_only: boolean;
  coupon_code: string | null;
  destination_url: string | null;
  redemption_brand: string | null;
  latitude: number | null;
  longitude: number | null;
  location_tags: string[];
  visual_seed: number;
  verification_status: string;
  last_verified_at: Date | null;
  created_at: Date;
  start_at: Date | null;
  expires_at: Date;
  distance_meters: number;
  /** Distance + freshness ranking key (lower = higher rank). Ordering only. */
  sort_key: number;
  source_trust: string;
  moderation_status: string;
  status: string;
  confidence_score: number | null;
  /** Tier rank (0=verified, 1=curated, 2=online, 3=community). Ordering only. */
  tier_rank: number;
  /** Human-readable tier label derived from tier_rank. */
  feed_tier: string;
}

const METERS_PER_MILE = 1609.344;

/** Map a raw nearby row, converting metres → miles. */
export function mapNearbyRow(row: NearbyRow) {
  return toDealDto(
    {
      id: row.id,
      title: row.title,
      merchant: row.merchant,
      categorySlug: row.category_slug,
      shortDescription: row.short_description,
      detailedDescription: row.detailed_description,
      terms: row.terms,
      currentPriceMinor: row.current_price_minor,
      originalPriceMinor: row.original_price_minor,
      currency: row.currency,
      dealScore: row.deal_score,
      isOnline: row.is_online,
      isStudentOnly: row.is_student_only,
      couponCode: row.coupon_code,
      destinationUrl: row.destination_url,
      redemptionBrand: row.redemption_brand,
      latitude: row.latitude,
      longitude: row.longitude,
      locationTags: row.location_tags,
      visualSeed: row.visual_seed,
      verificationStatus: row.verification_status,
      lastVerifiedAt: row.last_verified_at,
      createdAt: row.created_at,
      startAt: row.start_at,
      expiresAt: row.expires_at,
      sourceTrust: row.source_trust,
      moderationStatus: row.moderation_status,
      status: row.status,
      confidenceScore: row.confidence_score,
    },
    Number(row.distance_meters) / METERS_PER_MILE,
  );
}
