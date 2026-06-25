import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PlacePhotoService } from './place-photo.service';

// Usage: pnpm places:photos <regionSlug> [limit]
//   e.g. pnpm places:photos gsu        — fetch photos for high-value GSU places
//        pnpm places:photos gsu 25      — cap this run at 25 lookups
//
// API-SAFE: every Google call is counted and the run stops at the configured
// caps (MAX_PLACE_PHOTO_LOOKUPS_PER_RUN, MAX_PLACE_PHOTOS_PER_REGION). Stores
// keyless googleusercontent CDN URLs — the API key never reaches the client.
async function main(): Promise<void> {
  const regionSlug = process.argv[2];
  if (!regionSlug) throw new Error('Usage: pnpm places:photos <regionSlug> [limit]');
  const limitArg = process.argv[3];
  const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`Invalid limit: "${limitArg}"`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const log = await app.get(PlacePhotoService).fetchRegionPhotos(regionSlug, { limit });
    console.log('\n=== PlacePhotoLog ===');
    console.log(JSON.stringify(log, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
