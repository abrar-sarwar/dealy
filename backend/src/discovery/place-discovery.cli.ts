import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PlaceDiscoveryService, resolveCategories } from './place-discovery.service';

// Usage: pnpm places:discover <regionSlug> [maxPlaces] [--categories=<preset|csv>]
//   e.g. pnpm places:discover gsu 40 --categories=launch
//        pnpm places:discover gt 40 --categories=restaurant,cafe,bakery
// Prints the JSON summary { found, stored, deduped, placesCalls } so the
// Google Places API cost (placesCalls) is always visible.
//
// Presets (see place-discovery.service CATEGORY_PRESETS):
//   launch → restaurant, cafe, bakery, supermarket, grocery_or_supermarket,
//            bar, meal_takeaway
// The DEFAULT category set (restaurant, cafe) is used when --categories is omitted.
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positionals = args.filter((a) => !a.startsWith('--'));
  const regionSlug = positionals[0];
  if (!regionSlug) {
    throw new Error(
      'Usage: pnpm places:discover <regionSlug> [maxPlaces] [--categories=<preset|csv>]',
    );
  }

  const maxPlacesArg = positionals[1];
  const maxPlaces = maxPlacesArg ? Number.parseInt(maxPlacesArg, 10) : undefined;
  if (maxPlaces !== undefined && (!Number.isFinite(maxPlaces) || maxPlaces <= 0)) {
    throw new Error(`Invalid maxPlaces: "${maxPlacesArg}"`);
  }

  const categoriesArg = args.find((a) => a.startsWith('--categories='))?.split('=')[1];
  const categories = resolveCategories(categoriesArg);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const summary = await app
      .get(PlaceDiscoveryService)
      .discoverRegion(regionSlug, { maxPlaces, categories });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
