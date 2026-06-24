import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DiscoveryRunnerService } from './discovery-runner.service';
import { CandidatePromotionService } from './candidate-promotion.service';

// Usage: pnpm discovery:run <regionSlug>   (e.g. pnpm discovery:run atlanta)
async function main(): Promise<void> {
  const regionSlug = process.argv[2];
  if (!regionSlug) throw new Error('Usage: pnpm discovery:run <regionSlug>');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const summary = await app.get(DiscoveryRunnerService).runRegion(regionSlug);
    const promotion = await app.get(CandidatePromotionService).promoteRegion(regionSlug);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ summary, promotion }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
