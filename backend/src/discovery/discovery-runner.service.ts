import { Injectable, Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { DiscoveryService } from './discovery.service';
import type { FirecrawlBudgetService } from './firecrawl-budget.service';
import type { FirecrawlService } from '../services/firecrawl/firecrawl.service';
import type { GeminiService } from '../services/gemini/gemini.service';
import type { AiCacheService } from './ai-cache.service';
import type { MerchantLocationResolver } from './merchant-location.resolver';
import { contentHash } from './discovery-cost';
import { resolveCrawlTargets } from './url-targeting';
import { shouldConsiderSource, shouldEscalateToPro } from './escalation';
import { dealFingerprint } from '../ingestion/normalized-deal';
import { validImageUrl } from './deal-image';

export interface DiscoveryRunnerConfig {
  gemini: {
    model: string;
    reasoningModel: string;
    escalationMaxConfidence: number;
    escalationMinReliability: number;
  };
  targetPaths: string[];
}

export interface DiscoveryRunSummary {
  regionSlug: string;
  skipped: boolean;
  reason?: string;
  sourcesConsidered: number;
  pagesFetched: number;
  geminiSkips: number;
  candidatesStored: number;
}

function startOfUtcDay(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Normalize a deal's confidence to a 0–100 scale. Some models (e.g.
 * gemini-3.1-flash-lite) return a 0–1 probability; the publish threshold and
 * Pro-escalation logic both work in 0–100, so coerce fractions up.
 */
function normalizeConfidence<T extends { confidence: number }>(deals: T[]): T[] {
  return deals.map((d) => ({
    ...d,
    confidence:
      d.confidence > 0 && d.confidence <= 1
        ? Math.round(d.confidence * 100)
        : Math.round(d.confidence),
  }));
}

/** Campus zone slugs — a source whose zoneSlug is one of these auto-tags its
 *  deals with that campus even when Gemini returns campus_slug null. */
const CAMPUS_ZONES = new Set(['gsu', 'gt', 'ksu', 'uga']);

function isGeminiQuotaExhausted(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('Gemini request failed: 429') &&
    (message.includes('RESOURCE_EXHAUSTED') ||
      message.includes('generate_content_free_tier_requests') ||
      message.includes('Quota exceeded'))
  );
}

@Injectable()
export class DiscoveryRunnerService {
  private readonly logger = new Logger(DiscoveryRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
    private readonly budget: FirecrawlBudgetService,
    private readonly firecrawl: FirecrawlService,
    private readonly gemini: GeminiService,
    private readonly aiCache: AiCacheService,
    private readonly resolver: MerchantLocationResolver,
    private readonly config: DiscoveryRunnerConfig,
  ) {}

  async runRegion(regionSlug: string, now = new Date()): Promise<DiscoveryRunSummary> {
    const summary: DiscoveryRunSummary = {
      regionSlug,
      skipped: false,
      sourcesConsidered: 0,
      pagesFetched: 0,
      geminiSkips: 0,
      candidatesStored: 0,
    };

    const decision = await this.discovery.evaluateRegion(regionSlug, now);
    if (!decision.trigger) return { ...summary, skipped: true, reason: decision.reason };

    const inventory = await this.prisma.regionalInventory.findUnique({ where: { regionSlug } });
    const sources = await this.prisma.crawlSource.findMany({
      where: { zoneSlug: regionSlug, enabled: true },
    });

    for (const source of sources) {
      if (
        !shouldConsiderSource({
          enabled: source.enabled,
          lastCrawledAt: source.lastCrawledAt,
          crawlIntervalHours: source.crawlIntervalHours,
          now,
        })
      )
        continue;
      summary.sourcesConsidered++;

      const targets = resolveCrawlTargets({
        websiteUrl: source.url,
        dealUrl: source.dealUrl,
        targetPaths: source.targetPaths,
        allowedPaths: this.config.targetPaths,
      });
      if (targets.length === 0) continue;
      const url = targets[0];

      // A prior successful crawl means we already hold a processed hash for this
      // source, arming the recrawl cap.
      const sourceMayBeUnchanged = !!source.lastSuccessAt;

      // Per-source isolation: a failure in the budget read, Gemini planning, the
      // scrape, or persistence must never abort the whole region run. `run` is
      // assigned only once a crawl is actually started, so the failure path below
      // only updates it when it exists.
      let run: { id: string } | undefined;
      let pages = 0,
        queued = 0,
        unchanged = false;
      try {
        const gate = await this.budget.check(source.id, { sourceMayBeUnchanged }, now);
        if (!gate.allowed) {
          this.logger.warn({ source: source.id, reason: gate.reason }, 'discovery.budget.block');
          continue;
        }

        // Gemini plans whether the source is worth a paid fetch (cached per source/day).
        const plan = await this.aiCache.getOrGenerate(
          {
            task: 'crawl_plan',
            model: this.config.gemini.model,
            schemaVersion: 'v1',
            prompt: `${source.id}:${startOfUtcDay(now).toISOString()}`,
          },
          () =>
            this.gemini.planCrawl({
              sourceType: source.sourceType,
              url: source.url,
              category: source.defaultCategorySlug ?? undefined,
              reliabilityScore: source.reliabilityScore,
              averageDealsFound: source.averageDealsFound,
              lastSuccessAt: source.lastSuccessAt,
            }),
        );
        if (!plan.value.crawl) continue;

        run = await this.prisma.crawlRun.create({ data: { sourceId: source.id } });
        const doc = await this.firecrawl.scrape({ url });
        pages++;
        summary.pagesFetched++;
        const text = doc.markdown ?? '';
        // Page-level OG image, used as a fallback when a deal has no per-item image.
        // Different Firecrawl versions use `ogImage` or `og:image`.
        const meta = doc.metadata as Record<string, unknown> | undefined;
        const ogImageUrl = validImageUrl(meta?.ogImage ?? meta?.['og:image']);
        const hash = contentHash(text);

        const prior = await this.prisma.contentHash.findUnique({
          where: { sourceUrl_hash: { sourceUrl: url, hash } },
        });
        if (prior?.processedAt) {
          // Unchanged → reuse prior classification, skip Gemini entirely (P4).
          unchanged = true;
          summary.geminiSkips++;
          await this.prisma.contentHash.upsert({
            where: { sourceUrl_hash: { sourceUrl: url, hash } },
            create: { sourceUrl: url, sourceId: source.id, hash, processedAt: now },
            update: { processedAt: now },
          });
        } else {
          const extraction = await this.aiCache.getOrGenerate(
            {
              task: 'deal_extraction',
              model: this.config.gemini.model,
              schemaVersion: 'v1',
              prompt: `${url}:${hash}`,
            },
            () =>
              this.gemini.extractDeals({
                content: text,
                sourceUrl: url,
                merchantHint: source.merchantHint ?? undefined,
              }),
          );
          let deals = normalizeConfidence(extraction.value.deals);

          const needsPro = deals.some((dl) =>
            shouldEscalateToPro({
              confidence: dl.confidence,
              reliabilityScore: source.reliabilityScore,
              maxConfidence: this.config.gemini.escalationMaxConfidence,
              minReliability: this.config.gemini.escalationMinReliability,
            }),
          );
          if (needsPro) {
            const pro = await this.aiCache.getOrGenerate(
              {
                task: 'deal_extraction_pro',
                model: this.config.gemini.reasoningModel,
                schemaVersion: 'v1',
                prompt: `${url}:${hash}`,
              },
              () =>
                this.gemini.extractDeals({
                  content: text,
                  sourceUrl: url,
                  merchantHint: source.merchantHint ?? undefined,
                  model: this.config.gemini.reasoningModel,
                }),
            );
            deals = normalizeConfidence(pro.value.deals);
          }

          const contentHashRow = await this.prisma.contentHash.upsert({
            where: { sourceUrl_hash: { sourceUrl: url, hash } },
            create: {
              sourceUrl: url,
              sourceId: source.id,
              hash,
              processedAt: now,
              contentPreview: text.slice(0, 280),
            },
            update: { processedAt: now },
          });

          for (const dl of deals) {
            // Grocery circulars list food items, so Gemini tends to tag every line
            // 'food'; trust the curated source category for those. Otherwise prefer
            // the model's per-deal category, falling back to the source default.
            const categorySlug =
              source.kind === 'grocery_circular'
                ? (source.defaultCategorySlug ?? 'groceries')
                : dl.category || source.defaultCategorySlug || 'food';
            const fingerprint = dealFingerprint({
              merchant: dl.merchant || source.merchantHint || 'Unknown',
              title: dl.title,
              isOnline: !dl.location,
              locationTags: source.zoneSlug ? [source.zoneSlug] : [],
              latitude: null,
              longitude: null,
              currentPriceMinor: null,
              categorySlug,
            });
            if (await this.prisma.dealCandidate.findFirst({ where: { fingerprint } })) continue;

            const loc = await this.resolver.resolve({
              merchant: dl.merchant || source.merchantHint || null,
              locationText: dl.location ?? null,
              centroid:
                inventory?.latitude != null && inventory?.longitude != null
                  ? { latitude: inventory.latitude, longitude: inventory.longitude }
                  : null,
              radiusMiles: inventory?.radiusMiles ?? 10,
            });

            await this.prisma.dealCandidate.create({
              data: {
                sourceId: source.id,
                sourceUrl: url,
                contentHashId: contentHashRow.id,
                regionalInventoryId: inventory?.id ?? null,
                title: dl.title,
                merchant: dl.merchant || source.merchantHint || 'Unknown',
                discount: dl.discount,
                categorySlug,
                expiration: dl.expiration ? new Date(dl.expiration) : null,
                locationText: loc.locationText,
                latitude: loc.latitude,
                longitude: loc.longitude,
                locationPrecision: loc.locationPrecision,
                summary: dl.summary,
                confidence: dl.confidence,
                verificationStatus: dl.verification_status,
                fingerprint,
                raw: dl as object,
                // Prefer the per-deal product/food image Gemini picked from the page;
                // fall back to the page-level OG image.
                imageUrl: validImageUrl(dl.image_url) ?? ogImageUrl,
                requiresStudentId: dl.requires_student_id ?? false,
                campusSlug:
                  dl.campus_slug ??
                  (CAMPUS_ZONES.has(source.zoneSlug ?? '') ? source.zoneSlug : null),
              },
            });
            queued++;
            summary.candidatesStored++;
          }
        }

        await this.prisma.crawlRun.update({
          where: { id: run.id },
          data: {
            status: 'succeeded',
            fetched: pages,
            firecrawlPages: pages,
            queued,
            unchanged,
            finishedAt: now,
          },
        });
        await this.prisma.crawlSource.update({
          where: { id: source.id },
          data: {
            lastCrawledAt: now,
            lastSuccessAt: now,
            averageDealsFound:
              source.averageDealsFound === 0
                ? queued
                : source.averageDealsFound * 0.7 + queued * 0.3,
            reliabilityScore: Math.min(100, source.reliabilityScore + (queued > 0 ? 2 : 0)),
          },
        });
      } catch (err) {
        if (run) {
          await this.prisma.crawlRun.update({
            where: { id: run.id },
            data: {
              status: 'failed',
              error: (err as Error).message,
              firecrawlPages: pages,
              finishedAt: now,
            },
          });
          await this.prisma.crawlSource.update({
            where: { id: source.id },
            data: {
              lastCrawledAt: now,
              reliabilityScore: Math.max(0, source.reliabilityScore - 5),
            },
          });
        }
        this.logger.warn(
          { source: source.id, err: (err as Error).message },
          'discovery.source.failed',
        );
        if (isGeminiQuotaExhausted(err)) {
          this.logger.warn({ source: source.id }, 'discovery.ai_quota_exhausted.stop_region');
          break;
        }
      }
    }

    return summary;
  }
}
