import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PILOT_CATEGORIES } from '../ingestion/normalized-deal';

const METERS_PER_MILE = 1609.344;

/** Density-first launch threshold (spec §5): a zone qualifies when a typical
 * user there can receive at least this many active, source-verified,
 * category-eligible, physical deals within COVERAGE_RADIUS_MILES. */
export const COVERAGE_MIN_DEALS = 20;
export const COVERAGE_RADIUS_MILES = 10;

export interface ZoneCoverage {
  slug: string;
  name: string;
  /** Active, verified, pilot-category, physical deals within the radius. */
  dealsWithin10mi: number;
  qualifies: boolean;
  categoryDistribution: Record<string, number>;
}

export interface CoverageReport {
  thresholds: { minDeals: number; radiusMiles: number };
  zones: ZoneCoverage[];
  qualifiedZoneCount: number;
  totalActiveVerified: number;
  expiringSoon: number; // verified physical deals expiring within 48h
  verificationStatusCounts: Record<string, number>;
  duplicatesRejectedLast7d: { deduped: number; failed: number };
  providerHealth: Array<{
    provider: string;
    lastIngestAt: string | null;
    lastIngestStatus: string | null;
    lastVerifyAt: string | null;
    lastVerifyStatus: string | null;
  }>;
}

interface SlugCountRow {
  slug: string;
  count: number;
}

@Injectable()
export class CoverageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Coverage for one candidate zone: counts only active, source-verified,
   * pilot-category, physical deals within the radius. Online-only, expired,
   * duplicate, and unverified deals are excluded by construction, so coverage is
   * never inflated (spec §5).
   */
  async zoneCoverage(
    zone: { slug: string; name: string; latitude: number; longitude: number },
    radiusMiles = COVERAGE_RADIUS_MILES,
  ): Promise<ZoneCoverage> {
    const center = Prisma.sql`ST_SetSRID(ST_MakePoint(${zone.longitude}, ${zone.latitude}), 4326)::geography`;
    const rows = await this.prisma.$queryRaw<SlugCountRow[]>(Prisma.sql`
      SELECT cat.slug AS slug, count(*)::int AS count
      FROM deals d
      JOIN categories cat ON cat.id = d.category_id
      WHERE d.status = 'published'::deal_status
        AND d.source_trust = 'authoritative'::source_trust
        AND d.verification_status = 'verified'::verification_status
        AND d.is_online = false
        AND d.expires_at > now()
        AND d.geog IS NOT NULL
        AND cat.slug IN (${Prisma.join([...PILOT_CATEGORIES])})
        AND ST_DWithin(d.geog, ${center}, ${radiusMiles * METERS_PER_MILE})
      GROUP BY cat.slug
    `);

    const categoryDistribution: Record<string, number> = {};
    for (const slug of PILOT_CATEGORIES) categoryDistribution[slug] = 0;
    let total = 0;
    for (const r of rows) {
      categoryDistribution[r.slug] = Number(r.count);
      total += Number(r.count);
    }

    return {
      slug: zone.slug,
      name: zone.name,
      dealsWithin10mi: total,
      qualifies: total >= COVERAGE_MIN_DEALS,
      categoryDistribution,
    };
  }

  /** Full operational coverage report across candidate Atlanta zones. */
  async report(): Promise<CoverageReport> {
    // Candidate zones = Atlanta-tagged campus/city anchors, densest core first.
    const campuses = await this.prisma.campus.findMany({
      where: { locationTags: { has: 'atlanta' } },
      orderBy: { name: 'asc' },
    });

    const zones = await Promise.all(
      campuses.map((c) =>
        this.zoneCoverage({
          slug: c.slug,
          name: c.name,
          latitude: c.latitude,
          longitude: c.longitude,
        }),
      ),
    );
    zones.sort((a, b) => b.dealsWithin10mi - a.dealsWithin10mi);

    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const [statusGroups, expiringSoon, totalActiveVerified, ingestRuns, verifyRuns, dedupeAgg] =
      await Promise.all([
        this.prisma.deal.groupBy({ by: ['verificationStatus'], _count: true }),
        this.prisma.deal.count({
          where: {
            status: 'published',
            verificationStatus: 'verified',
            isOnline: false,
            expiresAt: { gt: now, lt: in48h },
          },
        }),
        this.prisma.deal.count({
          where: { status: 'published', verificationStatus: 'verified' },
        }),
        this.prisma.ingestionRun.findMany({
          orderBy: { startedAt: 'desc' },
          take: 50,
        }),
        this.prisma.verificationRun.findMany({
          orderBy: { startedAt: 'desc' },
          take: 50,
        }),
        this.prisma.ingestionRun.aggregate({
          where: { startedAt: { gt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
          _sum: { deduped: true, failed: true },
        }),
      ]);

    const verificationStatusCounts: Record<string, number> = {};
    for (const g of statusGroups) {
      verificationStatusCounts[g.verificationStatus] = typeof g._count === 'number' ? g._count : 0;
    }

    const providers = new Set<string>([
      ...ingestRuns.map((r) => r.provider),
      ...verifyRuns.map((r) => r.provider),
    ]);
    const providerHealth = [...providers].map((provider) => {
      const lastIngest = ingestRuns.find((r) => r.provider === provider);
      const lastVerify = verifyRuns.find((r) => r.provider === provider);
      return {
        provider,
        lastIngestAt: lastIngest?.finishedAt?.toISOString() ?? null,
        lastIngestStatus: lastIngest?.status ?? null,
        lastVerifyAt: lastVerify?.finishedAt?.toISOString() ?? null,
        lastVerifyStatus: lastVerify?.status ?? null,
      };
    });

    return {
      thresholds: { minDeals: COVERAGE_MIN_DEALS, radiusMiles: COVERAGE_RADIUS_MILES },
      zones,
      qualifiedZoneCount: zones.filter((z) => z.qualifies).length,
      totalActiveVerified,
      expiringSoon,
      verificationStatusCounts,
      duplicatesRejectedLast7d: {
        deduped: dedupeAgg._sum.deduped ?? 0,
        failed: dedupeAgg._sum.failed ?? 0,
      },
      providerHealth,
    };
  }
}
