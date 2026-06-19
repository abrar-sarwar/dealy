import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';
import { IngestionService } from './ingestion/ingestion.service';
import { SearchIndexer } from './search/search-indexer.service';
import { NotificationsService } from './notifications/notifications.service';
import { handleDealsJob, type DealsJob } from './ingestion/jobs';
import { createDealsQueue, createDealsWorker, redisConnection } from './queue/deals-queue';

/**
 * Worker process (`pnpm start:worker`). Processes the deals queue: provider
 * ingestion, expiration sweeps, and search reindex; schedules repeatable jobs.
 */
async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);
  const url = app.get(ConfigService<Env, true>).get('REDIS_URL', { infer: true });

  if (!url) {
    logger.warn('REDIS_URL not set — worker has nothing to connect to. Idle.');
    return;
  }

  const ingestion = app.get(IngestionService);
  const search = app.get(SearchIndexer);
  const notifications = app.get(NotificationsService);

  const workerConn = redisConnection(url);
  const worker = createDealsWorker(workerConn, (job) =>
    handleDealsJob(job.data as DealsJob, { ingestion, search, notifications }),
  );
  worker.on('completed', (job) =>
    logger.log(`Job ${job.id} [${(job.data as DealsJob).type}] completed`),
  );
  worker.on('failed', (job, err) => logger.error(`Job ${job?.id} failed: ${err.message}`));

  // Repeatable jobs — BullMQ dedupes by repeat options, so this is idempotent.
  const queueConn = redisConnection(url);
  const queue = createDealsQueue(queueConn);
  await queue.add('ingest-fixture', { type: 'ingest', provider: 'fixture' } satisfies DealsJob, {
    repeat: { pattern: '0 */6 * * *' },
  });
  await queue.add('expire', { type: 'expire' } satisfies DealsJob, {
    repeat: { pattern: '0 * * * *' },
  });
  await queue.add('notify-expiring', { type: 'notify-expiring' } satisfies DealsJob, {
    repeat: { pattern: '0 9 * * *' },
  });

  app.enableShutdownHooks();
  logger.log('Dealy worker started — processing the deals queue.');
}

void bootstrapWorker();
