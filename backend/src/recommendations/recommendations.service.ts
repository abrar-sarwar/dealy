import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapNearbyRow, mapPrismaDeal, type NearbyRow } from '../deals/deal.mapper';
import type { DealDto } from '../deals/deal.dto';

const METERS_PER_MILE = 1609.344;

interface RecRow extends NearbyRow {
  created_at: Date;
  save_count: bigint;
  view_count: bigint;
}

export interface RecommendedDeal extends DealDto {
  score: number;
  reasons: string[];
}

function humanize(slug: string): string {
  const spaced = slug.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Personalized, EXPLAINABLE recommendations. Deterministic weighted scoring of
   * transparent signals (distance, category match, discount, freshness,
   * popularity, urgency) — not a hidden algorithm. Excludes already-swiped deals.
   */
  async recommended(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: RecommendedDeal[]; total: number }> {
    const [profile, prefs, interestRows] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId }, include: { campus: true } }),
      this.prisma.userPreferences.findUnique({ where: { userId } }),
      this.prisma.userCategoryPreference.findMany({
        where: { userId },
        include: { category: { select: { slug: true } } },
      }),
    ]);

    const interests = new Set(interestRows.map((r) => r.category.slug));
    const campus = profile?.campus ?? null;
    const lat = campus?.latitude ?? 33.749;
    const lng = campus?.longitude ?? -84.388;
    const radiusMiles = prefs?.searchRadiusMiles ?? campus?.defaultRadius ?? 15;
    const radiusMeters = radiusMiles * METERS_PER_MILE;
    const center = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;

    const rows = await this.prisma.$queryRaw<RecRow[]>(Prisma.sql`
      SELECT d.id, d.title, d.merchant, cat.slug AS category_slug,
             d.short_description, d.detailed_description, d.terms,
             d.current_price_minor, d.original_price_minor, d.currency,
             d.deal_score, d.is_online, d.is_student_only, d.coupon_code, d.destination_url,
             d.latitude, d.longitude, d.location_precision, d.image_url, d.location_tags, d.visual_seed,
             d.verification_status, d.last_verified_at,
             d.start_at, d.expires_at, d.created_at,
             ST_Distance(d.geog, ${center}) AS distance_meters,
             (SELECT count(*) FROM saved_deals sd WHERE sd.deal_id = d.id) AS save_count,
             (SELECT count(*) FROM deal_interactions di WHERE di.deal_id = d.id AND di.type = 'view'::interaction_type) AS view_count
      FROM deals d
      JOIN categories cat ON cat.id = d.category_id
      WHERE d.status = 'published'::deal_status
        AND d.source_trust = 'authoritative'::source_trust
        AND d.verification_status = 'verified'::verification_status
        AND d.expires_at > now() AND d.geog IS NOT NULL
        AND ST_DWithin(d.geog, ${center}, ${radiusMeters})
        AND NOT EXISTS (
          SELECT 1 FROM deal_swipes s
          WHERE s.deal_id = d.id AND s.user_id = ${userId}::uuid AND s.undone = false
        )
      ORDER BY distance_meters ASC
      LIMIT 150
    `);

    const maxPop = Math.max(1, ...rows.map((r) => Number(r.save_count) * 3 + Number(r.view_count)));
    const now = Date.now();

    const scored = rows.map<RecommendedDeal>((r) => {
      const dto = mapNearbyRow(r);
      const distanceMiles = Number(r.distance_meters) / METERS_PER_MILE;
      const reasons: string[] = [];

      const categoryMatch = interests.has(dto.category) ? 1 : 0;
      if (categoryMatch) reasons.push(`Matches your ${humanize(dto.category)} interest`);

      const proximity = 1 - Math.min(distanceMiles / Math.max(radiusMiles, 1), 1);
      if (distanceMiles <= 1)
        reasons.push(campus ? `Near ${campus.shortName}` : 'Very close to you');

      const discount = Math.min(dto.savingsPercentage / 100, 1);
      if (dto.savingsPercentage >= 40) reasons.push(`${dto.savingsPercentage}% off`);

      const ageDays = (now - r.created_at.getTime()) / 86_400_000;
      const freshness = Math.max(0, 1 - ageDays / 7);
      if (ageDays <= 2) reasons.push('Recently added');

      const popularity = (Number(r.save_count) * 3 + Number(r.view_count)) / maxPop;
      if (popularity >= 0.6) reasons.push('Popular nearby');

      const hoursToExpiry = (r.expires_at.getTime() - now) / 3_600_000;
      const urgency = hoursToExpiry <= 12 ? 1 : 0;
      if (urgency) reasons.push('Ending soon');

      const score =
        0.3 * categoryMatch +
        0.2 * proximity +
        0.15 * discount +
        0.1 * freshness +
        0.1 * popularity +
        0.1 * urgency +
        0.05 * (dto.dealScore / 100);

      if (reasons.length === 0) reasons.push('Popular in your area');
      return { ...dto, score: Math.round(score * 1000) / 1000, reasons };
    });

    scored.sort((a, b) => b.score - a.score);
    return { items: scored.slice(offset, offset + limit), total: scored.length };
  }

  /** Trending by recent popularity (saves weighted over views). Public. */
  async trending(limit = 20): Promise<{ items: DealDto[]; total: number }> {
    const deals = await this.prisma.deal.findMany({
      where: {
        status: 'published',
        sourceTrust: 'authoritative',
        verificationStatus: 'verified',
        expiresAt: { gt: new Date() },
      },
      include: { category: true, _count: { select: { savedBy: true, interactions: true } } },
    });
    deals.sort(
      (a, b) =>
        b._count.savedBy * 3 +
          b._count.interactions -
          (a._count.savedBy * 3 + a._count.interactions) || b.dealScore - a.dealScore,
    );
    return {
      items: deals.slice(0, limit).map((d) => mapPrismaDeal(d, null)),
      total: deals.length,
    };
  }
}
