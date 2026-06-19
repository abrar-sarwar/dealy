import { Queue, Worker, type Job, type Processor } from 'bullmq';
import IORedis from 'ioredis';

export const DEALS_QUEUE = 'deals';

/** BullMQ-compatible Redis connection (requires maxRetriesPerRequest: null). */
export function redisConnection(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export function createDealsQueue(connection: IORedis, name = DEALS_QUEUE): Queue {
  return new Queue(name, { connection });
}

export function createDealsWorker(
  connection: IORedis,
  processor: Processor,
  name = DEALS_QUEUE,
): Worker {
  return new Worker(name, processor, {
    connection,
    concurrency: 4,
  });
}

export type { Job };
