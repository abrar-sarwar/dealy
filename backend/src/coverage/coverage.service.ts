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
  enabled: boolean;
  /** Active, verified, pilot-category, physical deals within the radius. */
  dealsWithin10mi: number;
  qualifies: boolean;
  categoryDistribution: Record<string, number>;
}

export type CoverageReason = 'qualified' | 'outside_coverage' | 'low_coverage';

/** Machine-readable Nearby coverage decision for a user's coordinates. */
export interface CoverageStatus {
  qualified: boolean;
  reason: CoverageReason;
  zoneSlug: string | null;
}

const EARTH_RADIUS_MILES = 3958.7613;

/** Great-circle distance in miles between two lat/lng points. */
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
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
    zone: { slug: string; name: string; latitude: number; longitude: number; enabled?: boolean },
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
      enabled: zone.enabled ?? false,
      dealsWithin10mi: total,
      qualifies: total >= COVERAGE_MIN_DEALS,
      categoryDistribution,
    };
  }

  /**
   * Machine-readable Nearby coverage decision for a user's coordinates — the
   * SINGLE source of truth shared by feed gating and the operational report.
   * - `outside_coverage`: not inside any enabled zone.
   * - `low_coverage`: inside an enabled zone, but no containing zone meets the
   *   >=20 authoritative-verified threshold yet.
   * - `qualified`: inside an enabled zone that currently meets the threshold.
   */
  async coverageForPoint(lat: number, lng: number): Promise<CoverageStatus> {
    const zones = await this.prisma.coverageZone.findMany({ where: { enabled: true } });
    const containing = zones.filter(
      (z) => haversineMiles(lat, lng, z.latitude, z.longitude) <= z.radiusMiles,
    );
    if (containing.length === 0) {
      return { qualified: false, reason: 'outside_coverage', zoneSlug: null };
    }
    for (const z of containing) {
      const cov = await this.zoneCoverage(z);
      if (cov.qualifies) return { qualified: true, reason: 'qualified', zoneSlug: z.slug };
    }
    return { qualified: false, reason: 'low_coverage', zoneSlug: containing[0].slug };
  }

  /** Full operational coverage report across enabled rollout zones. */
  async report(): Promise<CoverageReport> {
    // Source of truth = the same CoverageZone rows used by feed gating.
    const zoneRows = await this.prisma.coverageZone.findMany({ orderBy: { name: 'asc' } });

    const zones = await Promise.all(
      zoneRows.map((c) =>
        this.zoneCoverage({
          slug: c.slug,
          name: c.name,
          latitude: c.latitude,
          longitude: c.longitude,
          enabled: c.enabled,
        }),
      ),
    );
    zones.sort((a, b) => b.dealsWithin10mi - a.dealsWithin10mi);

    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const [statusGroups, expiringSoon, totalActiveVerified, ingestRuns, verifyRuns, dedupeAgg] =
      await Promise.all([
        this.prisma.deal.groupBy({ by: ['verificationStatus'], _count: true }),
        // Expiring soon: authoritative + published + verified + physical, within 48h.
        this.prisma.deal.count({
          where: {
            status: 'published',
            sourceTrust: 'authoritative',
            verificationStatus: 'verified',
            isOnline: false,
            expiresAt: { gt: now, lt: in48h },
          },
        }),
        // Total active verified: authoritative + published + verified + unexpired only.
        this.prisma.deal.count({
          where: {
            status: 'published',
            sourceTrust: 'authoritative',
            verificationStatus: 'verified',
            expiresAt: { gt: now },
          },
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
      // A zone is launch-ready only when it is ENABLED and meets the threshold —
      // identical semantics to the Nearby gate (coverageForPoint only ever
      // considers enabled zones). A disabled zone with inventory is not "qualified".
      qualifiedZoneCount: zones.filter((z) => z.enabled && z.qualifies).length,
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
