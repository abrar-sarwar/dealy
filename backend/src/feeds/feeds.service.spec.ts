// src/feeds/feeds.service.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CoverageService } from '../coverage/coverage.service';
import { FeedsService } from './feeds.service';

// Atlanta center used by the pilot zone.
const LAT = 33.7531, LNG = -84.3857;

describe('FeedsService.nearby blend ladder', () => {
  let prisma: PrismaService; let feeds: FeedsService;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [FeedsService, CoverageService, PrismaService],
    }).compile();
    prisma = mod.get(PrismaService); feeds = mod.get(FeedsService);
  });
  afterAll(async () => prisma.$disconnect());

  async function seedCurated(title: string) {
    const cat = await prisma.category.findFirstOrThrow({ where: { slug: 'food' } });
    // geog is a generated column (auto-derived from latitude/longitude), so it must NOT be in the INSERT.
    await prisma.$executeRawUnsafe(`
      INSERT INTO deals (id,external_id,title,merchant,category_id,status,moderation_status,
        source,source_trust,verification_status,is_online,latitude,longitude,
        location_tags,expires_at,created_at,updated_at)
      VALUES (gen_random_uuid(),$1,$2,'Cantina',$3::uuid,'published','approved',
        'crawler','editorial','pending',false,$4,$5,
        '{}',now()+interval '7 days',now(),now())
    `, `t-${title}`, title, cat.id, LAT, LNG);
  }

  it('blends CURATED when there is no VERIFIED inventory (never empty)', async () => {
    await seedCurated(`curated-${Date.now()}`);
    const page = await feeds.nearby({ lat: LAT, lng: LNG, radiusMiles: 10, limit: 20 } as any);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.blend.tiersIncluded).toContain('curated');
    // Honesty preserved: curated items are NOT badged verified.
    expect(page.items.every((d) => d.trustLevel !== 'verified' ? !d.verified : true)).toBe(true);
  });
});
