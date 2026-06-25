import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PlaceDiscoveryService } from './place-discovery.service';

// Usage: pnpm places:discover <regionSlug> [maxPlaces]
//   e.g. pnpm places:discover gsu 40
// Prints the JSON summary { found, stored, deduped, placesCalls } so the
// Google Places API cost (placesCalls) is always visible.
async function main(): Promise<void> {
  const regionSlug = process.argv[2];
  if (!regionSlug) throw new Error('Usage: pnpm places:discover <regionSlug> [maxPlaces]');
  const maxPlacesArg = process.argv[3];
  const maxPlaces = maxPlacesArg ? Number.parseInt(maxPlacesArg, 10) : undefined;
  if (maxPlaces !== undefined && (!Number.isFinite(maxPlaces) || maxPlaces <= 0)) {
    throw new Error(`Invalid maxPlaces: "${maxPlacesArg}"`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const summary = await app.get(PlaceDiscoveryService).discoverRegion(regionSlug, { maxPlaces });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
