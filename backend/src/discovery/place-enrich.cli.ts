import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PlaceEnrichmentService } from './place-enrichment.service';
import { PlaceFeedService } from './place-feed.service';

// Usage: pnpm places:enrich <regionSlug> [max]
//   e.g. pnpm places:enrich gsu        — enrich all pending GSU places
//        pnpm places:enrich gsu 8       — cap at 8 places this run
// Enriches (paced + cached + resumable) then prints the EnrichmentLog AND the
// resulting feed sections so the data engine output is visible.
async function main(): Promise<void> {
  const regionSlug = process.argv[2];
  if (!regionSlug) throw new Error('Usage: pnpm places:enrich <regionSlug> [max]');
  const maxArg = process.argv[3];
  const max = maxArg ? Number.parseInt(maxArg, 10) : undefined;
  if (max !== undefined && (!Number.isFinite(max) || max <= 0)) {
    throw new Error(`Invalid max: "${maxArg}"`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const log = await app.get(PlaceEnrichmentService).enrichRegion(regionSlug, { max });
    console.log('\n=== EnrichmentLog ===');
    console.log(JSON.stringify(log, null, 2));

    const sections = await app.get(PlaceFeedService).sections(regionSlug, { limit: 5 });
    console.log('\n=== Feed sections ===');
    for (const s of sections) {
      console.log(`\n# ${s.title} (${s.places.length})`);
      for (const p of s.places) {
        console.log(
          `  - ${p.name} | ${p.priceBucket ?? '?'} | rating ${p.rating ?? '?'} | score ${p.score.toFixed(
            3,
          )} | ${p.whyRecommended ?? ''}`,
        );
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
