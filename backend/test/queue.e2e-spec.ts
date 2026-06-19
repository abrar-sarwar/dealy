import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AppModule } from '../src/app.module';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { SearchIndexer } from '../src/search/search-indexer.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { handleDealsJob, type DealsJob } from '../src/ingestion/jobs';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_QUEUE = 'deals-test';

/** Verifies the BullMQ wiring end to end: enqueue → worker → ingestion. */
describe('Deals queue (BullMQ, e2e)', () => {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6381';
  let app: INestApplicationContext;
  let worker: Worker;
  let queue: Queue;
  let queueConn: IORedis;
  let workerConn: IORedis;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    await app.get(PrismaService).deal.deleteMany({ where: { source: 'fixture' } });
  });

  afterAll(async () => {
    await worker?.close();
    await queue?.close();
    await queueConn?.quit();
    await workerConn?.quit();
    await app?.get(PrismaService).deal.deleteMany({ where: { source: 'fixture' } });
    await app?.close();
  });

  it('processes an ingest job placed on the queue', async () => {
    const ingestion = app.get(IngestionService);
    const search = app.get(SearchIndexer);
    const notifications = app.get(NotificationsService);

    workerConn = new IORedis(url, { maxRetriesPerRequest: null });
    queueConn = new IORedis(url, { maxRetriesPerRequest: null });
    queue = new Queue(TEST_QUEUE, { connection: queueConn });

    const completed = new Promise<Record<string, unknown>>((resolve, reject) => {
      worker = new Worker(
        TEST_QUEUE,
        (job) => handleDealsJob(job.data as DealsJob, { ingestion, search, notifications }),
        { connection: workerConn },
      );
      worker.on('completed', (_job, result) => resolve(result as Record<string, unknown>));
      worker.on('failed', (_job, err) => reject(err));
    });

    await queue.add('ingest', { type: 'ingest', provider: 'fixture' } satisfies DealsJob);

    const result = await completed;
    expect(result.status).toBe('succeeded');
    expect(result.fetched).toBe(5);
  }, 25_000);
});
