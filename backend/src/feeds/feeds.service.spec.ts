// src/feeds/feeds.service.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CoverageService } from '../coverage/coverage.service';
import { FeedsService } from './feeds.service';

describe('FeedsService.nearby density-first gate', () => {
  let prisma: PrismaService; let feeds: FeedsService;
  // Anchorage — deterministically outside any enabled Atlanta coverage zone.
  const ANCHORAGE = { lat: 61.2181, lng: -149.9003 };
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [FeedsService, CoverageService, PrismaService],
    }).compile();
    prisma = mod.get(PrismaService); feeds = mod.get(FeedsService);
  });
  afterAll(async () => prisma.$disconnect());

  it('returns an honest EMPTY feed outside any coverage zone (no fabricated inventory)', async () => {
    const page = await feeds.nearby({ ...ANCHORAGE, radiusMiles: 10, limit: 20 } as any);
    expect(page.coverage.qualified).toBe(false);
    expect(page.coverage.reason).toBe('outside_coverage');
    expect(page.items).toEqual([]);
    expect(page.blend.tiersIncluded).toEqual([]);
  });

  it('does NOT blend ONLINE inventory into nearby — online lives in its own feed', async () => {
    // An authoritative+verified ONLINE deal must never backfill the nearby feed.
    const cat = await prisma.category.findFirstOrThrow({ where: { slug: 'food' } });
    await prisma.$executeRawUnsafe(`
      INSERT INTO deals (id,external_id,title,merchant,category_id,status,moderation_status,
        source,source_trust,verification_status,is_online,expires_at,created_at,updated_at)
      VALUES (gen_random_uuid(),$1,'Online Only','Web',$2::uuid,'published','approved',
        'seed','authoritative','verified',true,now()+interval '7 days',now(),now())
    `, `online-${Date.now()}`, cat.id);

    const page = await feeds.nearby({ ...ANCHORAGE, radiusMiles: 10, limit: 20 } as any);
    expect(page.items).toEqual([]); // gated by coverage; online is NOT blended in
  });
});
