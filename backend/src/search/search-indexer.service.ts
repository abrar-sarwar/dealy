import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { MEILI_CLIENT } from './search.constants';
import type { MeiliClient } from './meili.provider';
import { dealToSearchDoc } from './search.mapper';

/**
 * Keeps the Meilisearch index in sync with Postgres (the source of truth).
 * Indexing never blocks DB writes; full reindex is idempotent.
 */
@Injectable()
export class SearchIndexer {
  private readonly logger = new Logger(SearchIndexer.name);
  private readonly indexUid: string;

  constructor(
    @Inject(MEILI_CLIENT) private readonly meili: MeiliClient,
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    this.indexUid = config.get('MEILISEARCH_DEALS_INDEX', { infer: true });
  }

  get enabled(): boolean {
    return this.meili !== null;
  }

  async ensureSettings(): Promise<void> {
    if (!this.meili) return;
    try {
      const task = await this.meili.createIndex(this.indexUid, { primaryKey: 'id' });
      await this.meili.waitForTask(task.taskUid);
    } catch {
      // Index already exists — fine.
    }
    const settingsTask = await this.meili.index(this.indexUid).updateSettings({
      searchableAttributes: ['title', 'merchant', 'shortDescription', 'category', 'locationTags'],
      filterableAttributes: [
        'category',
        'isOnline',
        'isStudentOnly',
        'locationTags',
        'savingsPercentage',
        'currentPrice',
        'dealScore',
        'expiresAtTs',
        'status',
      ],
      sortableAttributes: [
        'dealScore',
        'savingsAmount',
        'currentPrice',
        'expiresAtTs',
        'createdAtTs',
      ],
    });
    await this.meili.waitForTask(settingsTask.taskUid);
  }

  /** Full rebuild from Postgres. Returns the number of indexed deals. */
  async reindexAll(): Promise<number> {
    if (!this.meili) return 0;
    await this.ensureSettings();
    const deals = await this.prisma.deal.findMany({
      where: { status: 'published' },
      include: { category: true },
    });
    const index = this.meili.index(this.indexUid);
    const clear = await index.deleteAllDocuments();
    await this.meili.waitForTask(clear.taskUid);
    if (deals.length > 0) {
      const add = await index.addDocuments(deals.map(dealToSearchDoc));
      await this.meili.waitForTask(add.taskUid);
    }
    this.logger.log(`Reindexed ${deals.length} deals into "${this.indexUid}"`);
    return deals.length;
  }

  /** Incremental upsert (called by ingestion / deal mutations in later phases). */
  async upsertDeals(ids: string[]): Promise<void> {
    if (!this.meili || ids.length === 0) return;
    const deals = await this.prisma.deal.findMany({
      where: { id: { in: ids }, status: 'published' },
      include: { category: true },
    });
    if (deals.length > 0) {
      await this.meili.index(this.indexUid).addDocuments(deals.map(dealToSearchDoc));
    }
  }

  async removeDeal(id: string): Promise<void> {
    if (!this.meili) return;
    await this.meili.index(this.indexUid).deleteDocument(id);
  }
}
