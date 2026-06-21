import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexer } from '../search/search-indexer.service';
import { PriceTrackingService } from '../notifications/price-tracking.service';
import { ProviderRegistry } from './provider-registry';
import {
  dealFingerprint,
  validateNormalizedDeal,
  type NormalizedDeal,
  type SourceTrust,
} from './normalized-deal';

export interface IngestionRunSummary {
  runId: string;
  provider: string;
  status: 'succeeded' | 'failed';
  available: boolean;
  fetched: number;
  upserted: number;
  deduped: number;
  failed: number;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly search: SearchIndexer,
    private readonly priceTracking: PriceTrackingService,
  ) {}

  async run(providerName: string): Promise<IngestionRunSummary> {
    const provider = this.registry.get(providerName);
    if (!provider) throw new NotFoundException(`Unknown provider: ${providerName}`);

    const run = await this.prisma.ingestionRun.create({ data: { provider: providerName } });

    if (!provider.isAvailable()) {
      await this.prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          error: 'provider unavailable (missing credentials)',
          finishedAt: new Date(),
        },
      });
      this.logger.warn(`Provider "${providerName}" unavailable — awaiting credentials.`);
      return {
        runId: run.id,
        provider: providerName,
        status: 'failed',
        available: false,
        fetched: 0,
        upserted: 0,
        deduped: 0,
        failed: 0,
      };
    }

    let fetched = 0;
    let upserted = 0;
    let deduped = 0;
    let failed = 0;
    const upsertedIds: string[] = [];

    try {
      const records = await provider.fetch();
      fetched = records.length;

      const categories = new Map(
        (await this.prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [
          c.slug,
          c.id,
        ]),
      );
      const seenFingerprints = new Set<string>();

      for (const rec of records) {
        try {
          validateNormalizedDeal(rec);
          const categoryId = categories.get(rec.categorySlug);
          if (!categoryId) throw new Error(`unknown category "${rec.categorySlug}"`);

          const fingerprint = dealFingerprint(rec);
          if (seenFingerprints.has(fingerprint)) {
            deduped++;
            continue;
          }
          seenFingerprints.add(fingerprint);

          // Cross-source duplicate already in the DB under a different externalId.
          const dupe = await this.prisma.deal.findFirst({
            where: { fingerprint, externalId: { not: rec.externalId } },
            select: { id: true },
          });
          if (dupe) {
            deduped++;
            continue;
          }

          const existing = await this.prisma.deal.findUnique({
            where: { externalId: rec.externalId },
            select: { currentPriceMinor: true },
          });

          // Resolve expiry ONCE, at first ingest. Re-ingesting the same record must
          // not slide its expiration forward — that's how relative fixture dates
          // (and any recurring re-fetch) would otherwise drift. An authoritative
          // source's genuine expiry change flows through verification, not ingestion.
          const { expiresAt, startAt, ...mutable } = this.toDealData(
            rec,
            categoryId,
            fingerprint,
            providerName,
            provider.trust,
          );
          const deal = await this.prisma.deal.upsert({
            where: { externalId: rec.externalId },
            update: mutable,
            create: { externalId: rec.externalId, ...mutable, expiresAt, startAt },
            select: { id: true },
          });
          upsertedIds.push(deal.id);
          upserted++;

          // Record price history + fire price-drop alerts to watchers/savers.
          await this.priceTracking.recordPriceChange(
            { id: deal.id, title: rec.title },
            existing?.currentPriceMinor ?? null,
            rec.currentPriceMinor,
          );
        } catch (err) {
          failed++;
          await this.prisma.ingestionFailure.create({
            data: { runId: run.id, externalId: rec.externalId, reason: (err as Error).message },
          });
        }
      }

      // Incremental search indexing — best-effort, never fails the run.
      try {
        await this.search.upsertDeals(upsertedIds);
      } catch (err) {
        this.logger.warn(`Search index update failed: ${(err as Error).message}`);
      }

      await this.prisma.ingestionRun.update({
        where: { id: run.id },
        data: { status: 'succeeded', fetched, upserted, deduped, failed, finishedAt: new Date() },
      });
      this.logger.log(
        `Ingest ${providerName}: fetched=${fetched} upserted=${upserted} deduped=${deduped} failed=${failed}`,
      );
      return {
        runId: run.id,
        provider: providerName,
        status: 'succeeded',
        available: true,
        fetched,
        upserted,
        deduped,
        failed,
      };
    } catch (err) {
      await this.prisma.ingestionRun.update({
        where: { id: run.id },
        data: { status: 'failed', error: (err as Error).message, finishedAt: new Date() },
      });
      throw err;
    }
  }

  /** Mark published deals whose expiry has passed as expired (worker sweep). */
  async expireDeals(now = new Date()): Promise<number> {
    const res = await this.prisma.deal.updateMany({
      where: { status: 'published', expiresAt: { lt: now } },
      data: { status: 'expired' },
    });
    return res.count;
  }

  private toDealData(
    rec: NormalizedDeal,
    categoryId: string,
    fingerprint: string,
    source: string,
    trust: SourceTrust,
  ): Prisma.DealUncheckedCreateInput {
    // A successful fetch from an AUTHORITATIVE provider is a real source
    // confirmation, so the deal lands verified. Editorial/fixture inventory is
    // never source-confirmed — it ingests as `pending` and never enters trust
    // paths (feeds, coverage, Verified badge). The daily job keeps this honest.
    const now = new Date();
    const authoritative = trust === 'authoritative';
    return {
      title: rec.title,
      merchant: rec.merchant,
      categoryId,
      shortDescription: rec.shortDescription,
      detailedDescription: rec.detailedDescription,
      terms: rec.terms,
      currentPriceMinor: rec.currentPriceMinor,
      originalPriceMinor: rec.originalPriceMinor,
      currency: rec.currency,
      dealScore: rec.dealScore,
      isOnline: rec.isOnline,
      isStudentOnly: rec.isStudentOnly,
      couponCode: rec.couponCode,
      destinationUrl: rec.destinationUrl,
      latitude: rec.latitude,
      longitude: rec.longitude,
      locationTags: rec.locationTags,
      visualSeed: rec.visualSeed,
      status: 'published',
      moderationStatus: 'approved',
      source,
      sourceTrust: trust,
      sourceUrl: rec.sourceUrl,
      providerAttribution: rec.providerAttribution,
      verificationStatus: authoritative ? 'verified' : 'pending',
      lastVerifiedAt: authoritative ? now : null,
      lastVerificationAttemptAt: authoritative ? now : null,
      verificationFailureReason: null,
      fingerprint,
      startAt: rec.startAt,
      expiresAt: rec.expiresAt,
    };
  }
}
