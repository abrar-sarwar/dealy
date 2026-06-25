import { Injectable, Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { SearchIndexer } from '../search/search-indexer.service';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Promotes high-confidence discovery candidates into published deals. Editorial
 *  trust — these surface in the ungated local feed only, never the
 *  authoritative Verified-gated feed (AI-extracted offers are not
 *  source-confirmed). Idempotent: re-promotion is blocked by promotedAt and by
 *  cross-source fingerprint dedup against existing deals. */
@Injectable()
export class CandidatePromotionService {
  private readonly logger = new Logger(CandidatePromotionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchIndexer,
    private readonly minConfidence: number,
    /** Candidates below this quality floor are dropped (e.g. "Purchase a Gift
     *  Card"-tier). Injected so the threshold is config, not a magic literal. */
    private readonly minQualityScore: number = 15,
  ) {}

  async promoteRegion(
    regionSlug: string,
    now = new Date(),
  ): Promise<{ promoted: number; skipped: number }> {
    const inventory = await this.prisma.regionalInventory.findUnique({ where: { regionSlug } });
    if (!inventory) {
      this.logger.warn({ regionSlug }, 'candidate-promotion.no-inventory');
      return { promoted: 0, skipped: 0 };
    }
    const candidates = await this.prisma.dealCandidate.findMany({
      where: {
        regionalInventoryId: inventory.id,
        promotedAt: null,
        confidence: { gte: this.minConfidence },
        // Drop sub-floor junk ("Purchase a Gift Card"-tier) before promotion.
        qualityScore: { gte: this.minQualityScore },
        verificationStatus: { notIn: ['invalid', 'expired'] },
      },
      // Highest-quality candidates win promotion first.
      orderBy: { qualityScore: 'desc' },
    });
    const categories = new Map(
      (await this.prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [
        c.slug,
        c.id,
      ]),
    );

    const publishedIds: string[] = [];
    let promoted = 0;
    let skipped = 0;

    for (const c of candidates) {
      const categoryId = categories.get(c.categorySlug);
      // Leave promotedAt null: retry once the category becomes mappable.
      if (!categoryId) {
        skipped++;
        continue;
      }

      if (c.fingerprint) {
        const existing = await this.prisma.deal.findFirst({
          where: { fingerprint: c.fingerprint },
          select: { id: true },
        });
        if (existing) {
          await this.prisma.dealCandidate.update({
            where: { id: c.id },
            data: { promotedAt: now },
          });
          skipped++;
          continue;
        }
      }

      const externalId = `discovery-${c.id}`;
      const expiresAt =
        c.expiration && c.expiration.getTime() > now.getTime()
          ? c.expiration
          : new Date(now.getTime() + 14 * 86_400_000);
      const deal = await this.prisma.deal.upsert({
        where: { externalId },
        update: { confidenceScore: Math.round(c.confidence), qualityScore: c.qualityScore },
        create: {
          externalId,
          title: c.title,
          merchant: c.merchant,
          categoryId,
          shortDescription: c.summary,
          detailedDescription: '',
          terms: '',
          currentPriceMinor: null,
          originalPriceMinor: null,
          currency: 'USD',
          dealScore: 50,
          // A deal with coordinates is physical (populates geog → appears in the
          // geographic local feed); coordinate-less ones are treated as online.
          isOnline: c.latitude == null,
          isStudentOnly: false,
          couponCode: null,
          destinationUrl: c.sourceUrl,
          latitude: c.latitude,
          longitude: c.longitude,
          locationPrecision: c.locationPrecision,
          locationTags: regionSlug ? [regionSlug] : [],
          visualSeed: Math.abs(hash(externalId)) % 1000,
          status: 'published',
          moderationStatus: 'approved',
          source: 'crawler',
          sourceTrust: 'editorial',
          sourceUrl: c.sourceUrl,
          providerAttribution: null,
          // Editorial deals are never source-confirmed by Dealy. Gemini's
          // self-reported verification_status must not grant trust — start pending.
          verificationStatus: 'pending',
          confidenceScore: Math.round(c.confidence),
          qualityScore: c.qualityScore,
          imageUrl: c.imageUrl,
          campusSlug: c.campusSlug,
          requiresStudentId: c.requiresStudentId,
          audience: c.audience,
          campusDealType: c.campusDealType,
          crawlSourceId: c.sourceId,
          fingerprint: c.fingerprint,
          startAt: null,
          expiresAt,
        },
        select: { id: true },
      });
      await this.prisma.dealCandidate.update({ where: { id: c.id }, data: { promotedAt: now } });
      publishedIds.push(deal.id);
      promoted++;
    }

    if (publishedIds.length) {
      try {
        await this.search.upsertDeals(publishedIds);
      } catch (err) {
        this.logger.warn(`search index: ${(err as Error).message}`);
      }
    }
    return { promoted, skipped };
  }
}
