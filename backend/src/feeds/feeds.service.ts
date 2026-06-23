import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapNearbyRow, mapPrismaDeal, type NearbyRow } from '../deals/deal.mapper';
import type { DealPage, NearbyDealPage, NearbyFeedQuery, OnlineFeedQuery } from '../deals/deal.dto';
import { CoverageService } from '../coverage/coverage.service';
import { FEED_TIER_CASE_SQL } from './feed-tier';
import type { FeedTier } from './feed-tier';

const METERS_PER_MILE = 1609.344;

/** Freshness offset: each hour since creation reduces the effective distance by
 * this many metres, so a much-fresher deal ranks ahead of a marginally-closer
 * stale one. Only the DIFFERENCE in created_at between deals matters, so the
 * key stays row-fixed and keyset-stable. */
const FRESHNESS_METERS_PER_HOUR = 40;

/** Online-feed cursor: `${createdAt ISO}:${uuid}`. The UUID has no colons, so
 * the final colon is the separator (the ISO timestamp contains colons). */
function encodeOnlineCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}:${id}`).toString('base64url');
}

function decodeOnlineCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.lastIndexOf(':');
    if (sep < 0) return null;
    const createdAt = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Blend cursor: `${radius}:${tierRank}:${sortKey}:${uuid}`. */
interface BlendCursor {
  radius: number;
  tierRank: number;
  sortKey: number;
  id: string;
}

function encodeBlendCursor(radius: number, tierRank: number, sortKey: number, id: string): string {
  return Buffer.from(`${radius}:${tierRank}:${sortKey}:${id}`).toString('base64url');
}

function decodeBlendCursor(c: string): BlendCursor | null {
  try {
    const [radius, tierRank, sortKey, id] = Buffer.from(c, 'base64url').toString('utf8').split(':');
    if (!id) return null;
    return { radius: Number(radius), tierRank: Number(tierRank), sortKey: Number(sortKey), id };
  } catch {
    return null;
  }
}

@Injectable()
export class FeedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: CoverageService,
  ) {}

  /**
   * Nearby deals within the requested radius, distance+freshness ranked,
   * cursor-paginated. DENSITY-FIRST: the feed is GATED by coverage. Outside an
   * enabled, sufficiently-dense zone it returns an honest EMPTY result (carrying
   * the coverage reason) rather than fabricating distant or online inventory.
   * Within a qualified zone it returns ONLY authoritative+verified physical
   * deals, capped to the requested radius (no expansion ladder).
   *
   * Always-available Online / Student / Trending inventory is served by its own
   * dedicated, location-independent feeds (/feeds/online, /feeds/student,
   * /feeds/trending) — deliberately NOT blended into nearby, so "deals near me"
   * stays honest about what's actually nearby.
   */
  async nearby(q: NearbyFeedQuery): Promise<NearbyDealPage> {
    const coverage = await this.coverage.coverageForPoint(q.lat, q.lng);
    const baseRadius = q.radiusMiles ?? 10;

    // Density-first gate: there is no honest local inventory to show outside a
    // qualified zone, so return an empty feed with the coverage reason — never a
    // distant/online backfill.
    if (!coverage.qualified) {
      return {
        items: [],
        nextCursor: null,
        coverage,
        blend: { radiusMilesUsed: baseRadius, tiersIncluded: [] },
      };
    }

    const limit = q.limit ?? 20;
    const center = Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography`;
    const cursor = q.cursor ? decodeBlendCursor(q.cursor) : null;
    const categoryFilter = q.category
      ? Prisma.sql`AND d.category_id = (SELECT id FROM categories WHERE slug = ${q.category})`
      : Prisma.empty;

    // Respect the requested radius exactly — no expansion ladder.
    const rows = await this.queryBlended(center, baseRadius * METERS_PER_MILE, limit, categoryFilter, cursor);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeBlendCursor(baseRadius, Number(last.tier_rank), Number(last.sort_key), last.id)
        : null;

    const items = page.map(mapNearbyRow);
    const tiersIncluded = [...new Set(items.map((d) => d.trustLevel as FeedTier))];
    return { items, nextCursor, coverage, blend: { radiusMilesUsed: baseRadius, tiersIncluded } };
  }

  /**
   * One blended, tier-ranked, keyset-paginated page. Includes VERIFIED
   * (physical) and CURATED inventory; ONLINE physical exclusion: only rows
   * with geog are included here (physical deals). Online deals (no geog) are
   * handled by Task 4.2, not here.
   *
   * SELECT column list is cross-checked against NearbyRow field by field:
   *   id, title, merchant, category_slug, short_description, detailed_description,
   *   terms, current_price_minor, original_price_minor, currency, deal_score,
   *   is_online, is_student_only, coupon_code, destination_url, latitude, longitude,
   *   location_tags, visual_seed, verification_status, last_verified_at,
   *   source_trust, moderation_status, status, confidence_score,
   *   created_at, start_at, expires_at, distance_meters, sort_key,
   *   tier_rank, feed_tier.
   */
  private async queryBlended(
    center: Prisma.Sql,
    radiusMeters: number,
    limit: number,
    categoryFilter: Prisma.Sql,
    cursor: BlendCursor | null,
  ): Promise<NearbyRow[]> {
    // Keyset comparison on (tier_rank, sort_key, id): tuple ordering consistent
    // with ORDER BY tier_rank ASC, sort_key ASC, id ASC.
    const cursorFilter = cursor
      ? Prisma.sql`WHERE (tier_rank > ${cursor.tierRank}::int)
                      OR (tier_rank = ${cursor.tierRank}::int AND sort_key > ${cursor.sortKey}::double precision)
                      OR (tier_rank = ${cursor.tierRank}::int AND sort_key = ${cursor.sortKey}::double precision AND id > ${cursor.id}::uuid)`
      : Prisma.empty;

    return this.prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT d.id, d.title, d.merchant, cat.slug AS category_slug,
               d.short_description, d.detailed_description, d.terms,
               d.current_price_minor, d.original_price_minor, d.currency,
               d.deal_score, d.is_online, d.is_student_only, d.coupon_code, d.destination_url,
               d.redemption_brand,
               d.latitude, d.longitude, d.location_tags, d.visual_seed,
               d.verification_status, d.last_verified_at, d.source_trust, d.moderation_status,
               d.status, d.confidence_score, d.created_at, d.start_at, d.expires_at,
               ST_Distance(d.geog, ${center}) AS distance_meters,
               (${Prisma.raw(FEED_TIER_CASE_SQL)})::int AS tier_rank,
               CASE (${Prisma.raw(FEED_TIER_CASE_SQL)})::int
                 WHEN 0 THEN 'verified' WHEN 1 THEN 'curated'
                 WHEN 2 THEN 'online' ELSE 'community' END AS feed_tier,
               round(ST_Distance(d.geog, ${center})
                 - EXTRACT(EPOCH FROM d.created_at) / 3600.0 * ${FRESHNESS_METERS_PER_HOUR}
               )::double precision AS sort_key
        FROM deals d
        JOIN categories cat ON cat.id = d.category_id
        WHERE d.status = 'published'::deal_status
          AND d.expires_at > now()
          AND d.geog IS NOT NULL
          AND ST_DWithin(d.geog, ${center}, ${radiusMeters})
          AND d.source_trust = 'authoritative'::source_trust
          AND d.verification_status = 'verified'::verification_status
          ${categoryFilter}
      )
      SELECT * FROM candidates
      ${cursorFilter}
      ORDER BY tier_rank ASC, sort_key ASC, id ASC
      LIMIT ${limit + 1}
    `);
  }

  /**
   * Anywhere feed: active, source-verified, ONLINE-only deals, newest first,
   * cursor-paginated. Requires no location. Physical deals are never returned
   * here, so denying location access never surfaces physical Atlanta inventory
   * (spec §6). Keyset pagination on (createdAt DESC, id DESC).
   */
  async online(q: OnlineFeedQuery): Promise<DealPage> {
    const limit = q.limit ?? 20;
    const cursor = q.cursor ? decodeOnlineCursor(q.cursor) : null;

    const cursorFilter: Prisma.DealWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.deal.findMany({
      where: {
        status: 'published',
        sourceTrust: 'authoritative',
        verificationStatus: 'verified',
        isOnline: true,
        expiresAt: { gt: new Date() },
        ...cursorFilter,
      },
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    const nextCursor = hasMore && last ? encodeOnlineCursor(last.createdAt, last.id) : null;

    return { items: page.map((d) => mapPrismaDeal(d, null)), nextCursor };
  }

  /**
   * Student Perks feed: curated, published, unexpired, student-only ONLINE
   * programs (Apple Education, Spotify Student, …), newest first, cursor-
   * paginated. These are CURATED (editorial trust), so each carries
   * `trustLevel: 'curated'` and never a Verified badge. No location required —
   * always available regardless of campus (location determines relevance, not
   * access). Keyset pagination on (createdAt DESC, id DESC), shared with online().
   */
  async student(q: OnlineFeedQuery): Promise<DealPage> {
    const limit = q.limit ?? 20;
    const cursor = q.cursor ? decodeOnlineCursor(q.cursor) : null;

    const cursorFilter: Prisma.DealWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.deal.findMany({
      where: {
        status: 'published',
        sourceTrust: 'editorial',
        moderationStatus: 'approved',
        isOnline: true,
        isStudentOnly: true,
        expiresAt: { gt: new Date() },
        ...cursorFilter,
      },
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    const nextCursor = hasMore && last ? encodeOnlineCursor(last.createdAt, last.id) : null;

    return { items: page.map((d) => mapPrismaDeal(d, null)), nextCursor };
  }

  /**
   * Cross-campus trending: exceptional (high-value or ending-soon) authoritative
   * + verified deals, featured to every campus regardless of location. Strongest
   * savings first. No geo filter by design — discovery, not proximity. A trending
   * deal near one campus reaches students at all four.
   */
  async trending(q: OnlineFeedQuery): Promise<DealPage> {
    const limit = q.limit ?? 20;
    const rows = await this.prisma.deal.findMany({
      where: {
        status: 'published',
        sourceTrust: 'authoritative',
        verificationStatus: 'verified',
        expiresAt: { gt: new Date() },
      },
      include: { category: true },
      orderBy: [{ dealScore: 'desc' }, { id: 'asc' }],
    });
    const items = rows
      .map((d) => mapPrismaDeal(d, null))
      .filter((d) => d.isTrending)
      .sort((a, b) => b.savingsPercentage - a.savingsPercentage || b.dealScore - a.dealScore)
      .slice(0, limit);
    return { items, nextCursor: null };
  }

  /**
   * Local Deals: curated (editorial), approved, published, PHYSICAL deals within
   * the radius (default 15mi), nearest first. NOT coverage-gated — this is the
   * curated discovery surface (the verified deck is /feeds/nearby). Online and
   * authoritative-only deals never appear here.
   */
  async local(q: NearbyFeedQuery): Promise<DealPage> {
    const limit = q.limit ?? 20;
    const radiusMeters = (q.radiusMiles ?? 15) * METERS_PER_MILE;
    const center = Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography`;
    const categoryFilter = q.category
      ? Prisma.sql`AND d.category_id = (SELECT id FROM categories WHERE slug = ${q.category})`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
      SELECT d.id, d.title, d.merchant, cat.slug AS category_slug,
             d.short_description, d.detailed_description, d.terms,
             d.current_price_minor, d.original_price_minor, d.currency,
             d.deal_score, d.is_online, d.is_student_only, d.coupon_code, d.destination_url,
             d.redemption_brand,
             d.latitude, d.longitude, d.location_tags, d.visual_seed,
             d.verification_status, d.last_verified_at, d.source_trust, d.moderation_status,
             d.status, d.confidence_score, d.created_at, d.start_at, d.expires_at,
             ST_Distance(d.geog, ${center}) AS distance_meters,
             (${Prisma.raw(FEED_TIER_CASE_SQL)})::int AS tier_rank,
             CASE (${Prisma.raw(FEED_TIER_CASE_SQL)})::int
               WHEN 0 THEN 'verified' WHEN 1 THEN 'curated'
               WHEN 2 THEN 'online' ELSE 'community' END AS feed_tier,
             ST_Distance(d.geog, ${center})::double precision AS sort_key
      FROM deals d
      JOIN categories cat ON cat.id = d.category_id
      WHERE d.status = 'published'::deal_status
        AND d.source_trust = 'editorial'::source_trust
        AND d.moderation_status = 'approved'::moderation_status
        AND d.is_online = false
        AND d.geog IS NOT NULL
        AND d.expires_at > now()
        AND ST_DWithin(d.geog, ${center}, ${radiusMeters})
        ${categoryFilter}
      ORDER BY distance_meters ASC, id ASC
      LIMIT ${limit}
    `);
    return { items: rows.map(mapNearbyRow), nextCursor: null };
  }
}
