import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapNearbyRow, mapPrismaDeal, type NearbyRow } from '../deals/deal.mapper';
import type { DealPage, NearbyFeedQuery, OnlineFeedQuery } from '../deals/deal.dto';

const METERS_PER_MILE = 1609.344;

function encodeCursor(sortKey: number, id: string): string {
  return Buffer.from(`${sortKey}:${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { sortKey: number; id: string } | null {
  try {
    const [d, id] = Buffer.from(cursor, 'base64url').toString('utf8').split(':');
    const sortKey = Number(d);
    if (!id || Number.isNaN(sortKey)) return null;
    return { sortKey, id };
  } catch {
    return null;
  }
}

/**
 * Distance + freshness ranking weight. A deal's effective sort key is its real
 * distance in metres MINUS a freshness credit proportional to how recently it was
 * created: each hour of extra age costs FRESHNESS_METERS_PER_HOUR equivalent
 * metres. Only the *difference* in created_at between deals matters, so the key
 * depends solely on row-fixed values (distance + created_at) — never on `now()`.
 * That keeps keyset pagination stable across requests while ensuring a much
 * fresher deal is not beaten by a marginally-closer very-stale one. Active deals
 * are short-lived (bounded by expiry), so no explicit age cap is needed. Real
 * distance shown to the user is unaffected.
 */
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

@Injectable()
export class FeedsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nearby deals within radius, ranked by distance + freshness, cursor-paginated.
   * Returns ONLY active, source-verified, physical deals: status published,
   * verification_status verified, not expired, not online, with geography inside
   * the radius (GiST-indexed ST_DWithin + ST_Distance). Online-only deals are
   * never blended in (spec §6).
   */
  async nearby(q: NearbyFeedQuery): Promise<DealPage> {
    const limit = q.limit ?? 20;
    const radiusMeters = (q.radiusMiles ?? 10) * METERS_PER_MILE;
    const center = Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography`;
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;

    const categoryFilter = q.category
      ? Prisma.sql`AND d.category_id = (SELECT id FROM categories WHERE slug = ${q.category})`
      : Prisma.empty;

    // Cast the cursor key to double precision so the keyset comparison is
    // float8 = float8. Binding the JS number as `numeric` would promote the
    // float8 sort_key to its full decimal, which never equals the shortest-decimal
    // param — the boundary row would then re-appear on the next page.
    const cursorFilter = cursor
      ? Prisma.sql`WHERE (sort_key > ${cursor.sortKey}::double precision)
                      OR (sort_key = ${cursor.sortKey}::double precision AND id > ${cursor.id}::uuid)`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT d.id, d.title, d.merchant, cat.slug AS category_slug,
               d.short_description, d.detailed_description, d.terms,
               d.current_price_minor, d.original_price_minor, d.currency,
               d.deal_score, d.is_online, d.is_student_only, d.coupon_code, d.destination_url,
               d.latitude, d.longitude, d.location_tags, d.visual_seed,
               d.verification_status, d.last_verified_at,
               d.created_at, d.start_at, d.expires_at,
               ST_Distance(d.geog, ${center}) AS distance_meters,
               -- Round to whole metres so the key is an integer-valued double that
               -- survives the PG -> JS number -> PG keyset round-trip EXACTLY.
               -- (A fractional float8 is sent back as a rounded decimal string and
               -- the boundary row would re-appear on the next page.) Whole-metre
               -- ranking precision is irrelevant.
               round(ST_Distance(d.geog, ${center})
                 - EXTRACT(EPOCH FROM d.created_at) / 3600.0 * ${FRESHNESS_METERS_PER_HOUR}
               )::double precision AS sort_key
        FROM deals d
        JOIN categories cat ON cat.id = d.category_id
        WHERE d.status = 'published'::deal_status
          AND d.verification_status = 'verified'::verification_status
          AND d.is_online = false
          AND d.expires_at > now()
          AND d.geog IS NOT NULL
          AND ST_DWithin(d.geog, ${center}, ${radiusMeters})
          ${categoryFilter}
      )
      SELECT * FROM candidates
      ${cursorFilter}
      ORDER BY sort_key ASC, id ASC
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    const nextCursor = hasMore && last ? encodeCursor(Number(last.sort_key), last.id) : null;

    return { items: page.map(mapNearbyRow), nextCursor };
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
}
