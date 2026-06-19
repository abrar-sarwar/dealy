import type { IngestionService } from './ingestion.service';
import type { SearchIndexer } from '../search/search-indexer.service';
import type { NotificationsService } from '../notifications/notifications.service';

export type DealsJob =
  | { type: 'ingest'; provider: string }
  | { type: 'expire' }
  | { type: 'reindex' }
  | { type: 'notify-expiring' };

export interface JobDeps {
  ingestion: IngestionService;
  search: SearchIndexer;
  notifications: NotificationsService;
}

/** Pure job dispatcher shared by the worker process and the queue tests. */
export async function handleDealsJob(data: DealsJob, deps: JobDeps): Promise<unknown> {
  switch (data.type) {
    case 'ingest':
      return deps.ingestion.run(data.provider);
    case 'expire':
      return { expired: await deps.ingestion.expireDeals() };
    case 'reindex':
      return { indexed: await deps.search.reindexAll() };
    case 'notify-expiring':
      return { notified: await deps.notifications.sweepExpiringSaved() };
  }
}
