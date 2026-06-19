import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { mapPrismaDeal } from '../deals/deal.mapper';
import type { DealDto } from '../deals/deal.dto';
import { MEILI_CLIENT } from './search.constants';
import type { MeiliClient } from './meili.provider';
import { searchDocToDealDto, type SearchDoc } from './search.mapper';
import { SearchQueryDto, SearchSort } from './search.dto';

export interface SearchResult {
  items: DealDto[];
  total: number;
  backend: 'meili' | 'postgres';
}

/**
 * User-facing deal search. Meilisearch is primary (typo-tolerant, fast filters);
 * if it's unconfigured or errors, a Postgres ILIKE query serves as a resilient
 * fallback so search never hard-fails.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly indexUid: string;

  constructor(
    @Inject(MEILI_CLIENT) private readonly meili: MeiliClient,
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    this.indexUid = config.get('MEILISEARCH_DEALS_INDEX', { infer: true });
  }

  async search(q: SearchQueryDto): Promise<SearchResult> {
    if (this.meili) {
      try {
        return await this.meiliSearch(this.meili, q);
      } catch (err) {
        this.logger.error(
          `Meili search failed, falling back to Postgres: ${(err as Error).message}`,
        );
      }
    }
    return this.postgresSearch(q);
  }

  private async meiliSearch(
    meili: NonNullable<MeiliClient>,
    q: SearchQueryDto,
  ): Promise<SearchResult> {
    const nowTs = Math.floor(Date.now() / 1000);
    const filter: string[] = ['status = "published"', `expiresAtTs > ${nowTs}`];
    if (q.category) filter.push(`category = "${q.category}"`);
    if (q.online !== undefined) filter.push(`isOnline = ${q.online}`);
    if (q.student) filter.push('isStudentOnly = true');
    if (q.minDiscount !== undefined) filter.push(`savingsPercentage >= ${q.minDiscount}`);
    if (q.maxPrice !== undefined) filter.push(`currentPrice <= ${q.maxPrice}`);

    const res = await meili.index(this.indexUid).search<SearchDoc>(q.q ?? '', {
      filter,
      sort: this.meiliSort(q.sort),
      limit: q.limit ?? 20,
      offset: q.offset ?? 0,
    });
    return {
      items: res.hits.map(searchDocToDealDto),
      total: res.estimatedTotalHits ?? res.hits.length,
      backend: 'meili',
    };
  }

  private meiliSort(sort?: SearchSort): string[] | undefined {
    switch (sort) {
      case SearchSort.newest:
        return ['createdAtTs:desc'];
      case SearchSort.savings:
        return ['savingsAmount:desc'];
      case SearchSort.priceLow:
        return ['currentPrice:asc'];
      case SearchSort.endingSoon:
        return ['expiresAtTs:asc'];
      default:
        return undefined; // relevance
    }
  }

  /** Resilient fallback (no typo tolerance; minDiscount unsupported here). */
  private async postgresSearch(q: SearchQueryDto): Promise<SearchResult> {
    const where: Prisma.DealWhereInput = { status: 'published', expiresAt: { gt: new Date() } };
    if (q.category) where.category = { slug: q.category };
    if (q.online !== undefined) where.isOnline = q.online;
    if (q.student) where.isStudentOnly = true;
    if (q.maxPrice !== undefined) {
      where.currentPriceMinor = { lte: BigInt(Math.round(q.maxPrice * 100)) };
    }
    if (q.q) {
      where.OR = [
        { title: { contains: q.q, mode: 'insensitive' } },
        { merchant: { contains: q.q, mode: 'insensitive' } },
        { shortDescription: { contains: q.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        orderBy: this.pgOrder(q.sort),
        include: { category: true },
        take: q.limit ?? 20,
        skip: q.offset ?? 0,
      }),
      this.prisma.deal.count({ where }),
    ]);
    return { items: rows.map((r) => mapPrismaDeal(r, null)), total, backend: 'postgres' };
  }

  private pgOrder(sort?: SearchSort): Prisma.DealOrderByWithRelationInput {
    switch (sort) {
      case SearchSort.newest:
        return { createdAt: 'desc' };
      case SearchSort.priceLow:
        return { currentPriceMinor: 'asc' };
      case SearchSort.endingSoon:
        return { expiresAt: 'asc' };
      case SearchSort.savings:
      default:
        return { dealScore: 'desc' };
    }
  }
}
