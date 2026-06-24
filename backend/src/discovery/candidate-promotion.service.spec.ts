import { CandidatePromotionService } from './candidate-promotion.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SearchIndexer } from '../search/search-indexer.service';

type Candidate = {
  id: string;
  sourceId: string;
  sourceUrl: string;
  categorySlug: string;
  title: string;
  merchant: string;
  summary: string;
  discount: string;
  confidence: number;
  verificationStatus: string;
  fingerprint: string;
  expiration: null;
  locationText: null;
  latitude: number | null;
  longitude: number | null;
};

function deps(
  over: {
    candidate?: Partial<Candidate>;
    candidates?: Candidate[];
    existingDeal?: { id: string } | null;
  } = {},
) {
  const candidate: Candidate = {
    id: 'c1',
    sourceId: 'src1',
    sourceUrl: 'https://shop.com/deals',
    categorySlug: 'groceries',
    title: '20% off deli',
    merchant: 'Shop',
    summary: 's',
    discount: '20%',
    confidence: 90,
    verificationStatus: 'pending',
    fingerprint: 'fp1',
    expiration: null,
    locationText: null,
    latitude: 33.749,
    longitude: -84.388,
    ...over.candidate,
  };
  return {
    candidate,
    prisma: {
      regionalInventory: { findUnique: jest.fn(async () => ({ id: 'r1', regionSlug: 'atlanta' })) },
      dealCandidate: {
        findMany: jest.fn(async () => over.candidates ?? [candidate]),
        update: jest.fn(async () => ({})),
      },
      category: { findMany: jest.fn(async () => [{ id: 'cat-groceries', slug: 'groceries' }]) },
      deal: {
        findFirst: jest.fn(async () => over.existingDeal ?? null),
        upsert: jest.fn(async () => ({ id: 'deal1' })),
      },
    },
    search: { upsertDeals: jest.fn(async () => undefined) },
  };
}

function build(d: ReturnType<typeof deps>) {
  return new CandidatePromotionService(
    d.prisma as unknown as PrismaService,
    d.search as unknown as SearchIndexer,
    80,
  );
}

describe('CandidatePromotionService.promoteRegion', () => {
  it('promotes a high-confidence candidate to a published deal and marks it promoted', async () => {
    const d = deps();
    const out = await build(d).promoteRegion('atlanta');
    expect(d.prisma.deal.upsert).toHaveBeenCalledTimes(1);
    const arg = (
      d.prisma.deal.upsert.mock.calls[0] as unknown as [{ create: Record<string, unknown> }]
    )[0];
    expect(arg.create).toEqual(
      expect.objectContaining({
        status: 'published',
        moderationStatus: 'approved',
        source: 'crawler',
        sourceTrust: 'editorial',
        categoryId: 'cat-groceries',
        // Coordinates flow candidate → deal so geog populates and the deal is
        // returned by the geographic local feed; with coords it is not online.
        latitude: 33.749,
        longitude: -84.388,
        isOnline: false,
      }),
    );
    expect(d.prisma.dealCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ promotedAt: expect.any(Date) }),
      }),
    );
    expect(d.search.upsertDeals).toHaveBeenCalledWith(['deal1']);
    expect(out.promoted).toBe(1);
  });

  it('does not create a duplicate deal when one with the fingerprint exists; marks candidate promoted', async () => {
    const d = deps({ existingDeal: { id: 'deal-existing' } });
    const out = await build(d).promoteRegion('atlanta');
    expect(d.prisma.deal.upsert).not.toHaveBeenCalled();
    expect(d.prisma.dealCandidate.update).toHaveBeenCalledTimes(1);
    expect(out.promoted).toBe(0);
    expect(out.skipped).toBe(1);
  });

  it('skips candidates whose category is unknown', async () => {
    const d = deps({ candidate: { categorySlug: 'mystery' } });
    const out = await build(d).promoteRegion('atlanta');
    expect(d.prisma.deal.upsert).not.toHaveBeenCalled();
    expect(d.prisma.dealCandidate.update).not.toHaveBeenCalled();
    expect(out.skipped).toBe(1);
  });
});
