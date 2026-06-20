import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapNearbyRow, mapPrismaDeal, type NearbyRow } from '../deals/deal.mapper';
import type { DealPage, NearbyFeedQuery, OnlineFeedQuery } from '../deals/deal.dto';

const METERS_PER_MILE = 1609.344;

function encodeCursor(distanceMeters: number, id: string): string {
  return Buffer.from(`${distanceMeters}:${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { distanceMeters: number; id: string } | null {
  try {
    const [d, id] = Buffer.from(cursor, 'base64url').toString('utf8').split(':');
    const distanceMeters = Number(d);
    if (!id || Number.isNaN(distanceMeters)) return null;
    return { distanceMeters, id };
  } catch {
    return null;
  }
}

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
   * Nearby published deals within radius, sorted by distance, cursor-paginated.
   * Uses the GiST-indexed `geog` column via ST_DWithin (indexed) + ST_Distance.
   * Online deals (no geography) are excluded.
   */
  async nearby(q: NearbyFeedQuery): Promise<DealPage> {
    const limit = q.limit ?? 20;
    const radiusMeters = (q.radiusMiles ?? 5) * METERS_PER_MILE;
    const center = Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography`;
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;

    const categoryFilter = q.category
      ? Prisma.sql`AND d.category_id = (SELECT id FROM categories WHERE slug = ${q.category})`
      : Prisma.empty;

    const cursorFilter = cursor
      ? Prisma.sql`WHERE (distance_meters > ${cursor.distanceMeters})
                      OR (distance_meters = ${cursor.distanceMeters} AND id > ${cursor.id}::uuid)`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<NearbyRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT d.id, d.title, d.merchant, cat.slug AS category_slug,
               d.short_description, d.detailed_description, d.terms,
               d.current_price_minor, d.original_price_minor, d.currency,
               d.deal_score, d.is_online, d.is_student_only, d.coupon_code, d.destination_url,
               d.latitude, d.longitude, d.location_tags, d.visual_seed,
               d.created_at, d.start_at, d.expires_at,
               ST_Distance(d.geog, ${center}) AS distance_meters
        FROM deals d
        JOIN categories cat ON cat.id = d.category_id
        WHERE d.status = 'published'::deal_status
          AND d.expires_at > now()
          AND d.geog IS NOT NULL
          AND ST_DWithin(d.geog, ${center}, ${radiusMeters})
          ${categoryFilter}
      )
      SELECT * FROM candidates
      ${cursorFilter}
      ORDER BY distance_meters ASC, id ASC
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    const nextCursor = hasMore && last ? encodeCursor(Number(last.distance_meters), last.id) : null;

    return { items: page.map(mapNearbyRow), nextCursor };
  }

  /**
   * Active online-only published deals, newest first, cursor-paginated.
   * Keyset pagination on (createdAt DESC, id DESC) for stable, overlap-free
   * pages. Online deals have no geography, so distance is always null.
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
