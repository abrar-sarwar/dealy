import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SearchIndexer } from './search-indexer.service';

/** CLI: `pnpm search:reindex` — rebuild the Meilisearch index from Postgres. */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const indexer = app.get(SearchIndexer);
  if (!indexer.enabled) {
    console.log('Meilisearch not configured — nothing to reindex.');
  } else {
    const count = await indexer.reindexAll();

    console.log(`Reindexed ${count} deals.`);
  }
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
