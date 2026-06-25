import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PlaceCrawlEnrollmentService } from './place-crawl-enrollment.service';
import { DiscoveryRunnerService } from './discovery-runner.service';
import { CandidatePromotionService } from './candidate-promotion.service';
import { PrismaService } from '../prisma/prisma.service';

// Usage: pnpm places:crawl <regionSlug> [maxPlaces]   (e.g. pnpm places:crawl gsu 25)
//
// P2 pipeline in one command:
//   1. enroll eligible place websites in <regionSlug> as targeted crawl sources
//      (capped at maxPlaces, upsert so re-runs don't duplicate);
//   2. run the existing discovery pass for that zone so the newly-enrolled
//      sources get crawled in the SAME command;
//   3. promote the resulting candidates;
//   4. report the enrollment log + discovery summary + how many candidates carry
//      a placeId (the P2 success signal: real deals linked to a Place).
async function main(): Promise<void> {
  const regionSlug = process.argv[2];
  if (!regionSlug) throw new Error('Usage: pnpm places:crawl <regionSlug> [maxPlaces]');
  const maxPlacesArg = process.argv[3];
  const maxPlaces = maxPlacesArg ? Number.parseInt(maxPlacesArg, 10) : undefined;
  if (maxPlaces !== undefined && (!Number.isFinite(maxPlaces) || maxPlaces <= 0)) {
    throw new Error(`Invalid maxPlaces: "${maxPlacesArg}"`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const prisma = app.get(PrismaService);

    const enrollment = await app
      .get(PlaceCrawlEnrollmentService)
      .enrollRegion(regionSlug, { maxPlaces });

    const summary = await app.get(DiscoveryRunnerService).runRegion(regionSlug);
    const promotion = await app.get(CandidatePromotionService).promoteRegion(regionSlug);

    // P2 observability: how many candidates / deals in this zone now carry a Place
    // link, and how many of those came from THIS run's enrolled place sources.
    const inventory = await prisma.regionalInventory.findUnique({ where: { regionSlug } });
    const placeLinkedCandidates = await prisma.dealCandidate.count({
      where: { placeId: { not: null }, regionalInventoryId: inventory?.id ?? undefined },
    });
    const placeLinkedDeals = await prisma.deal.count({ where: { placeId: { not: null } } });
    const placeSourcesEnabled = await prisma.crawlSource.count({
      where: { zoneSlug: regionSlug, placeId: { not: null }, enabled: true },
    });

    const report = {
      enrollment,
      discovery: summary,
      promotion,
      placeCrawl: {
        placeSourcesEnabled,
        placeLinkedCandidates,
        placeLinkedDeals,
      },
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
