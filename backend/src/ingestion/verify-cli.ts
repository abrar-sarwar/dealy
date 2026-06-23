import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { VerificationService } from './verification.service';

/** CLI: `pnpm verify` — re-verify every active deal against its source now. */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const summaries = await app.get(VerificationService).verifyAll();

  console.log(JSON.stringify(summaries, null, 2));
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
