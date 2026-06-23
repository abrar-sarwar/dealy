// src/crawler/crawl-cli.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CrawlerService } from './crawler.service';

/** CLI: `pnpm crawl <sourceId|all>`. */
async function main(): Promise<void> {
  const arg = process.argv[2] ?? 'all';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const svc = app.get(CrawlerService);
  const result = arg === 'all' ? await svc.runAll() : await svc.runSource(arg);
  console.log(JSON.stringify(result, null, 2));
  await app.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
