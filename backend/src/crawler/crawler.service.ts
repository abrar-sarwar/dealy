// src/crawler/crawler.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexer } from '../search/search-indexer.service';
import type { Env } from '../config/env.schema';
import { autoPublishKinds } from '../config/env.schema';
import { SourceFetcher } from './source-fetcher';
import { StructuredExtractor } from './extractors/structured-extractor';
import { LlmExtractor } from './extractors/llm-extractor';
import { GEOCODER, type Geocoder } from './geocoding/geocoder';
import { confidenceScore, LOW_GEOCODE_CONFIDENCE, type DealCandidate } from './deal-candidate';
import type { RawCandidate } from './extractors/deal-extractor';

export interface CrawlRunSummary {
  runId: string; sourceId: string;
  status: 'succeeded' | 'failed';
  fetched: number; queued: number; deduped: number; failed: number; autoPublished: number;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcher: SourceFetcher,
    private readonly structured: StructuredExtractor,
    private readonly llm: LlmExtractor,
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
    private readonly config: ConfigService<Env, true>,
    private readonly search: SearchIndexer,
  ) {}

  async runAll(): Promise<CrawlRunSummary[]> {
    const sources = await this.prisma.crawlSource.findMany({ where: { enabled: true } });
    const out: CrawlRunSummary[] = [];
    for (const s of sources) out.push(await this.runSource(s.id));
    return out;
  }

  async runSource(sourceId: string): Promise<CrawlRunSummary> {
    const source = await this.prisma.crawlSource.findUniqueOrThrow({ where: { id: sourceId } });
    const run = await this.prisma.crawlRun.create({ data: { sourceId } });
    let fetched = 0, queued = 0, deduped = 0, failed = 0, autoPublished = 0;
    const publishedIds: string[] = [];

    try {
      const html = await this.fetcher.fetchPage(source.url);
      const ctx = { url: source.url, merchantHint: source.merchantHint ?? undefined, defaultCategorySlug: source.defaultCategorySlug ?? undefined };

      // Hybrid: structured first, LLM only if structured found nothing.
      let raws: RawCandidate[] = (await this.structured.extract(html, ctx)).candidates;
      if (raws.length === 0) raws = (await this.llm.extract(html, ctx)).candidates;
      fetched = raws.length;

      const categories = new Map(
        (await this.prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]),
      );
      const threshold = this.config.get('CRAWLER_AUTOPUBLISH_THRESHOLD', { infer: true });
      const kinds = autoPublishKinds({ CRAWLER_AUTOPUBLISH_KINDS: this.config.get('CRAWLER_AUTOPUBLISH_KINDS', { infer: true }) ?? '' });

      for (const raw of raws) {
        try {
          const geo = raw.address ? await this.geocoder.geocode(raw.address) : null;
          const candidate: DealCandidate = {
            ...raw,
            latitude: geo?.latitude ?? null,
            longitude: geo?.longitude ?? null,
            geocodeConfidence: geo?.confidence ?? 0,
          };
          const categoryId = categories.get(candidate.categorySlug);
          if (!categoryId) throw new Error(`unknown category "${candidate.categorySlug}"`);
          if (!candidate.expiresAt || candidate.expiresAt.getTime() <= Date.now()) {
            // Default a 14-day window for dateless specials so they can expire.
            candidate.expiresAt = new Date(Date.now() + 14 * 86_400_000);
          }

          const score = confidenceScore(candidate);
          const externalId = `crawl-${source.id}-${this.slug(candidate.title)}`;
          const fingerprint = this.fingerprint(candidate);

          const dupe = await this.prisma.deal.findFirst({
            where: { fingerprint, externalId: { not: externalId } }, select: { id: true },
          });
          if (dupe) { deduped++; continue; }

          const goodGeocode = candidate.geocodeConfidence >= LOW_GEOCODE_CONFIDENCE;
          const autoOk =
            threshold !== undefined && score >= threshold && goodGeocode && kinds.includes(source.kind);

          const data: Prisma.DealUncheckedCreateInput = {
            externalId,
            title: candidate.title,
            merchant: candidate.merchant || 'Unknown',
            categoryId,
            shortDescription: candidate.title,
            detailedDescription: '',
            terms: '',
            currentPriceMinor: candidate.currentPriceMinor,
            originalPriceMinor: null,
            currency: 'USD',
            dealScore: 50,
            isOnline: candidate.latitude === null,
            isStudentOnly: candidate.isStudentOnly,
            couponCode: candidate.couponCode,
            destinationUrl: candidate.sourceUrl,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            locationTags: [],
            visualSeed: Math.abs(this.hash(externalId)) % 1000,
            status: autoOk ? 'published' : 'draft',
            moderationStatus: autoOk ? 'approved' : 'pending',
            source: 'crawler',
            sourceTrust: 'editorial',
            sourceUrl: candidate.sourceUrl,
            providerAttribution: null,
            verificationStatus: 'pending',
            confidenceScore: score,
            crawlSourceId: source.id,
            fingerprint,
            startAt: candidate.startAt,
            expiresAt: candidate.expiresAt,
          };

          const deal = await this.prisma.deal.upsert({
            where: { externalId },
            update: { confidenceScore: score, latitude: candidate.latitude, longitude: candidate.longitude },
            create: data,
            select: { id: true },
          });
          queued++;
          if (autoOk) { autoPublished++; publishedIds.push(deal.id); }
        } catch (err) {
          failed++;
          await this.prisma.crawlFailure.create({
            data: { runId: run.id, url: source.url, reason: (err as Error).message },
          });
        }
      }

      try { await this.search.upsertDeals(publishedIds); }
      catch (err) { this.logger.warn(`search index: ${(err as Error).message}`); }

      await this.prisma.crawlRun.update({
        where: { id: run.id },
        data: { status: 'succeeded', fetched, queued, deduped, failed, finishedAt: new Date() },
      });
      // Best-effort: update lastCrawledAt on the source — non-fatal if the prisma
      // fake or a race condition omits this method.
      try {
        await this.prisma.crawlSource.update({ where: { id: source.id }, data: { lastCrawledAt: new Date() } });
      } catch { /* non-fatal */ }
      return { runId: run.id, sourceId, status: 'succeeded', fetched, queued, deduped, failed, autoPublished };
    } catch (err) {
      await this.prisma.crawlRun.update({
        where: { id: run.id }, data: { status: 'failed', error: (err as Error).message, finishedAt: new Date() },
      });
      return { runId: run.id, sourceId, status: 'failed', fetched, queued, deduped, failed, autoPublished };
    }
  }

  private slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  }
  private fingerprint(c: DealCandidate): string {
    const loc = c.latitude !== null ? `${c.latitude},${c.longitude}` : 'online';
    return require('node:crypto').createHash('sha1')
      .update([c.merchant, c.title, loc, String(c.currentPriceMinor ?? ''), c.categorySlug].join('|').toLowerCase())
      .digest('hex');
  }
  private hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
}
