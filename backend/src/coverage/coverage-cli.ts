import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CoverageService } from './coverage.service';

/** CLI: `pnpm coverage` — print the density-first coverage report as JSON. */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const report = await app.get(CoverageService).report();
  console.log(JSON.stringify(report, null, 2));
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
