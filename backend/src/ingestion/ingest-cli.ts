import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IngestionService } from './ingestion.service';

/** CLI: `pnpm ingest [provider]` (default: fixture). */
async function main(): Promise<void> {
  const provider = process.argv[2] ?? 'fixture';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const summary = await app.get(IngestionService).run(provider);

  console.log(JSON.stringify(summary, null, 2));
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
