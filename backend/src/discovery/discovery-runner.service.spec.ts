import { DiscoveryRunnerService } from './discovery-runner.service';
import type { GeminiDealExtraction } from '../services/gemini/gemini.types';

const cfg = {
  gemini: {
    model: 'flash',
    reasoningModel: 'pro',
    escalationMaxConfidence: 60,
    escalationMinReliability: 80,
  },
  targetPaths: ['/deals', '/weekly-ad', '/coupons'],
};

type Source = {
  id: string;
  url: string;
  dealUrl: string | null;
  targetPaths: string[];
  sourceType: string;
  kind: string;
  merchantHint: string;
  defaultCategorySlug: string;
  zoneSlug: string;
  reliabilityScore: number;
  averageDealsFound: number;
  lastSuccessAt: Date | null;
  lastCrawledAt: Date | null;
  crawlIntervalHours: number;
  enabled: boolean;
  placeId?: string | null;
};

type ResolvedLocation = {
  latitude: number | null;
  longitude: number | null;
  locationPrecision: 'exact' | 'approximate';
  locationText: string | null;
};

function deps(
  over: {
    source?: Partial<Source>;
    sources?: Source[];
    priorHash?: { id: string; processedAt: Date } | null;
    budget?: { allowed: boolean; reason?: string; remainingPages: number };
    plan?: { crawl: boolean; reason: string; priority: number };
    resolverResult?: ResolvedLocation;
  } = {},
) {
  const source = {
    id: 's1',
    url: 'https://shop.com/weekly-ad',
    dealUrl: null,
    targetPaths: [],
    sourceType: 'weekly_ad',
    kind: 'grocery_circular',
    merchantHint: 'Shop',
    defaultCategorySlug: 'groceries',
    zoneSlug: 'atlanta',
    reliabilityScore: 70,
    averageDealsFound: 2,
    lastSuccessAt: null,
    lastCrawledAt: null,
    crawlIntervalHours: 24,
    enabled: true,
    placeId: null,
    ...over.source,
  };
  const sources = over.sources ?? [source];

  const defaultResolverResult: ResolvedLocation = over.resolverResult ?? {
    latitude: 33.749,
    longitude: -84.388,
    locationPrecision: 'approximate',
    locationText: null,
  };

  return {
    source,
    prisma: {
      crawlSource: { findMany: jest.fn(async () => sources), update: jest.fn(async () => source) },
      crawlRun: {
        create: jest.fn(async () => ({ id: 'run1' })),
        update: jest.fn(async () => ({})),
      },
      contentHash: {
        findUnique: jest.fn(async () => over.priorHash ?? null),
        upsert: jest.fn(async () => ({ id: 'h1' })),
      },
      regionalInventory: {
        findUnique: jest.fn(async () => ({
          id: 'r1',
          regionSlug: 'atlanta',
          latitude: 33.749,
          longitude: -84.388,
          radiusMiles: 10,
        })),
      },
      dealCandidate: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'c1' })),
      },
    },
    discovery: {
      evaluateRegion: jest.fn(async () => ({ trigger: true, reason: 'below_minimum_deals' })),
    },
    budget: { check: jest.fn(async () => over.budget ?? { allowed: true, remainingPages: 10 }) },
    firecrawl: { scrape: jest.fn(async () => ({ markdown: '20% off deli', url: source.url })) },
    gemini: {
      planCrawl: jest.fn(async () => over.plan ?? { crawl: true, reason: 'fresh', priority: 7 }),
      extractDeals: jest.fn(
        async (): Promise<GeminiDealExtraction> => ({
          deals: [
            {
              title: '20% off deli',
              merchant: 'Shop',
              category: 'groceries',
              discount: '20%',
              expiration: null,
              location: null,
              summary: 's',
              confidence: 90,
              verification_status: 'pending',
              verified: false,
              image_url: null,
              campus_slug: null,
              requires_student_id: false,
              audience: 'general',
              campus_deal_type: 'other',
              area_relevance: 0.8,
              concrete_offer_score: 0.9,
              is_vague: false,
            },
          ],
        }),
      ),
    },
    aiCache: {
      getOrGenerate: jest.fn(async (_p: unknown, gen: () => Promise<unknown>) => ({
        value: await gen(),
        cacheHit: false,
      })),
    },
    resolver: {
      resolve: jest.fn(async () => defaultResolverResult),
    },
  };
}

function build(d: ReturnType<typeof deps>) {
  return new DiscoveryRunnerService(
    d.prisma as never,
    d.discovery as never,
    d.budget as never,
    d.firecrawl as never,
    d.gemini as never,
    d.aiCache as never,
    d.resolver as never,
    cfg as never,
  );
}

describe('DiscoveryRunnerService.runRegion', () => {
  it('skips entirely when the region does not need a refresh', async () => {
    const d = deps();
    d.discovery.evaluateRegion = jest.fn(async () => ({
      trigger: false,
      reason: 'inventory_healthy',
    }));
    const out = await build(d).runRegion('atlanta');
    expect(out.skipped).toBe(true);
    expect(d.firecrawl.scrape).not.toHaveBeenCalled();
    expect(d.gemini.planCrawl).not.toHaveBeenCalled();
  });

  it('uses the curated source category for grocery circulars even when extraction mislabels items', async () => {
    const d = deps({ source: { kind: 'grocery_circular', defaultCategorySlug: 'groceries' } });
    d.gemini.extractDeals = jest.fn(
      async (): Promise<GeminiDealExtraction> => ({
        deals: [
          {
            title: 'Eggs $1.99/dozen',
            merchant: 'Shop',
            category: 'food', // model tags grocery lines as food
            discount: '20%',
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending',
            verified: false,
            image_url: null as string | null,
            campus_slug: null as string | null,
            requires_student_id: false,
            audience: 'general' as const,
            campus_deal_type: 'dining' as const,
            area_relevance: 0.8,
            concrete_offer_score: 0.9,
            is_vague: false,
          },
        ],
      }),
    );
    await build(d).runRegion('atlanta');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [{ data: { categorySlug: string } }]
    )[0];
    expect(arg.data.categorySlug).toBe('groceries');
  });

  it('prefers the per-deal product image over the page OG image', async () => {
    const d = deps();
    d.firecrawl.scrape = jest.fn(async () => ({
      markdown: '![](https://cdn.shop.com/eggs.jpg) Eggs',
      url: 'https://shop.com/weekly-ad',
      metadata: { ogImage: 'https://cdn.shop.com/store-logo.png' },
    }));
    d.gemini.extractDeals = jest.fn(
      async (): Promise<GeminiDealExtraction> => ({
        deals: [
          {
            title: 'Eggs $1.99',
            merchant: 'Shop',
            category: 'groceries',
            discount: '20%',
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending',
            verified: false,
            image_url: 'https://cdn.shop.com/eggs.jpg' as string | null,
            campus_slug: null as string | null,
            requires_student_id: false,
            audience: 'general' as const,
            campus_deal_type: 'dining' as const,
            area_relevance: 0.8,
            concrete_offer_score: 0.9,
            is_vague: false,
          },
        ],
      }),
    );
    await build(d).runRegion('atlanta');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { imageUrl: string | null } },
      ]
    )[0];
    expect(arg.data.imageUrl).toBe('https://cdn.shop.com/eggs.jpg');
  });

  it('runs the full pipeline and persists a candidate with approximate centroid by default', async () => {
    const d = deps();
    const out = await build(d).runRegion('atlanta');
    expect(d.budget.check).toHaveBeenCalledWith(
      's1',
      { sourceMayBeUnchanged: false },
      expect.any(Date),
    );
    expect(d.gemini.planCrawl).toHaveBeenCalledTimes(1);
    expect(d.firecrawl.scrape).toHaveBeenCalledWith({ url: 'https://shop.com/weekly-ad' });
    expect(d.gemini.extractDeals).toHaveBeenCalledTimes(1);
    expect(d.prisma.dealCandidate.create).toHaveBeenCalledTimes(1);
    // Candidate carries the exact region centroid (honest coordinates) and is
    // marked approximate; per-deal geocoding is deferred to a future pass.
    const candidateArg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { latitude: number; longitude: number; locationPrecision: string } },
      ]
    )[0];
    expect(candidateArg.data.latitude).toBe(33.749);
    expect(candidateArg.data.longitude).toBe(-84.388);
    expect(candidateArg.data.locationPrecision).toBe('approximate');
    expect(out.candidatesStored).toBe(1);
  });

  it('stores exact coords when resolver returns exact precision', async () => {
    const d = deps({
      resolverResult: {
        latitude: 33.771,
        longitude: -84.39,
        locationPrecision: 'exact',
        locationText: '100 Peachtree St, Atlanta, GA',
      },
    });
    await build(d).runRegion('atlanta');

    expect(d.resolver.resolve).toHaveBeenCalledTimes(1);
    const candidateArg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        {
          data: {
            latitude: number;
            longitude: number;
            locationPrecision: string;
            locationText: string;
          };
        },
      ]
    )[0];
    expect(candidateArg.data.latitude).toBe(33.771);
    expect(candidateArg.data.longitude).toBe(-84.39);
    expect(candidateArg.data.locationPrecision).toBe('exact');
    expect(candidateArg.data.locationText).toBe('100 Peachtree St, Atlanta, GA');
  });

  it('resolver is called with merchant, locationText, centroid, and radiusMiles', async () => {
    const d = deps();
    await build(d).runRegion('atlanta');

    expect(d.resolver.resolve).toHaveBeenCalledWith({
      merchant: 'Shop',
      locationText: null,
      centroid: { latitude: 33.749, longitude: -84.388 },
      radiusMiles: 10,
    });
  });

  it('skips Gemini and marks the run unchanged when content hash is unchanged', async () => {
    const d = deps({ priorHash: { id: 'h1', processedAt: new Date('2026-06-20') } });
    const out = await build(d).runRegion('atlanta');
    expect(d.firecrawl.scrape).toHaveBeenCalledTimes(1);
    expect(d.gemini.extractDeals).not.toHaveBeenCalled();
    expect(out.geminiSkips).toBe(1);
    expect(d.prisma.crawlRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unchanged: true }) }),
    );
  });

  it('passes sourceMayBeUnchanged=true to the budget when the source has a prior successful crawl', async () => {
    const d = deps({ source: { lastSuccessAt: new Date('2026-06-20T00:00:00Z') } });
    await build(d).runRegion('atlanta');
    expect(d.budget.check).toHaveBeenCalledWith(
      's1',
      { sourceMayBeUnchanged: true },
      expect.any(Date),
    );
  });

  it('does not scrape when Gemini declines the crawl', async () => {
    const d = deps({ plan: { crawl: false, reason: 'unlikely', priority: 1 } });
    await build(d).runRegion('atlanta');
    expect(d.firecrawl.scrape).not.toHaveBeenCalled();
  });

  it('does not call Gemini or scrape when the budget denies the source', async () => {
    const d = deps({ budget: { allowed: false, reason: 'source_page_cap', remainingPages: 0 } });
    await build(d).runRegion('atlanta');
    expect(d.gemini.planCrawl).not.toHaveBeenCalled();
    expect(d.firecrawl.scrape).not.toHaveBeenCalled();
  });

  it('escalates to Pro for low-confidence deals from reliable sources', async () => {
    const d = deps({ source: { reliabilityScore: 85 } });
    d.gemini.extractDeals = jest
      .fn()
      .mockResolvedValueOnce({
        deals: [
          {
            title: 't',
            merchant: 'Shop',
            category: 'groceries',
            discount: null,
            expiration: null,
            location: null,
            summary: 's',
            confidence: 40,
            verification_status: 'pending',
            verified: false,
            image_url: null as string | null,
            campus_slug: null as string | null,
            requires_student_id: false,
            audience: 'general' as const,
            campus_deal_type: 'other' as const,
            area_relevance: 0.8,
            concrete_offer_score: 0.9,
            is_vague: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        deals: [
          {
            title: 't',
            merchant: 'Shop',
            category: 'groceries',
            discount: null,
            expiration: null,
            location: null,
            summary: 's',
            confidence: 88,
            verification_status: 'pending',
            verified: false,
            image_url: null as string | null,
            campus_slug: null as string | null,
            requires_student_id: false,
            audience: 'general' as const,
            campus_deal_type: 'other' as const,
            area_relevance: 0.8,
            concrete_offer_score: 0.9,
            is_vague: false,
          },
        ],
      });
    await build(d).runRegion('atlanta');
    expect(d.gemini.extractDeals).toHaveBeenCalledTimes(2);
    expect(d.gemini.extractDeals).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'pro' }),
    );
  });

  it('isolates a source failure — a throwing planCrawl does not abort the region', async () => {
    const d = deps();
    d.gemini.planCrawl = jest.fn(async () => {
      throw new Error('gemini boom');
    });
    // Must resolve (not reject): one bad source cannot abort the whole region.
    const out = await build(d).runRegion('atlanta');
    expect(out.skipped).toBe(false);
    expect(out.candidatesStored).toBe(0);
    expect(d.firecrawl.scrape).not.toHaveBeenCalled();
  });

  it('stops the region after Gemini daily quota is exhausted to avoid more Firecrawl spend', async () => {
    const first: Source = {
      ...deps().source,
      id: 's1',
      url: 'https://shop.com/weekly-ad',
    };
    const second: Source = {
      ...deps().source,
      id: 's2',
      url: 'https://shop.com/coupons',
    };
    const d = deps({ sources: [first, second] });
    d.gemini.extractDeals = jest.fn(async () => {
      throw new Error(
        'Gemini request failed: 429 {"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests"}}',
      );
    });

    const out = await build(d).runRegion('atlanta');

    expect(out.sourcesConsidered).toBe(1);
    expect(d.firecrawl.scrape).toHaveBeenCalledTimes(1);
    expect(d.firecrawl.scrape).toHaveBeenCalledWith({ url: 'https://shop.com/weekly-ad' });
    expect(d.gemini.planCrawl).toHaveBeenCalledTimes(1);
  });

  it('sets campusSlug from zoneSlug when zoneSlug is a campus zone and Gemini returns null', async () => {
    const d = deps({ source: { zoneSlug: 'gsu' } });
    d.gemini.extractDeals = jest.fn(
      async (): Promise<GeminiDealExtraction> => ({
        deals: [
          {
            title: 'Student Pizza Deal',
            merchant: 'Rosa',
            category: 'food',
            discount: '20%',
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending' as const,
            verified: false,
            image_url: null as string | null,
            campus_slug: null as string | null,
            requires_student_id: true,
            audience: 'students' as const,
            campus_deal_type: 'student_discount' as const,
            area_relevance: 0.8,
            concrete_offer_score: 0.9,
            is_vague: false,
          },
        ],
      }),
    );
    await build(d).runRegion('gsu');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { campusSlug: string | null; requiresStudentId: boolean } },
      ]
    )[0];
    expect(arg.data.campusSlug).toBe('gsu');
    expect(arg.data.requiresStudentId).toBe(true);
  });

  it('uses Gemini campus_slug over zoneSlug default when both are present', async () => {
    const d = deps({ source: { zoneSlug: 'gsu' } });
    d.gemini.extractDeals = jest.fn(
      async (): Promise<GeminiDealExtraction> => ({
        deals: [
          {
            title: 'Tech Student Deal',
            merchant: 'BestBuy',
            category: 'tech',
            discount: '10%',
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending' as const,
            verified: false,
            image_url: null,
            campus_slug: 'gt' as string | null,
            requires_student_id: true,
            audience: 'students' as const,
            campus_deal_type: 'student_discount' as const,
            area_relevance: 0.8,
            concrete_offer_score: 0.9,
            is_vague: false,
          },
        ],
      }),
    );
    await build(d).runRegion('gsu');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { campusSlug: string | null } },
      ]
    )[0];
    expect(arg.data.campusSlug).toBe('gt');
  });

  it('leaves campusSlug null for non-campus zones even when Gemini returns null', async () => {
    const d = deps({ source: { zoneSlug: 'midtown' } });
    d.gemini.extractDeals = jest.fn(
      async (): Promise<GeminiDealExtraction> => ({
        deals: [
          {
            title: 'Pizza Deal',
            merchant: 'PizzaPlus',
            category: 'food',
            discount: '10%',
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending' as const,
            verified: false,
            image_url: null as string | null,
            campus_slug: null as string | null,
            requires_student_id: false,
            audience: 'general' as const,
            campus_deal_type: 'restaurant_lead' as const,
            area_relevance: 0.8,
            concrete_offer_score: 0.9,
            is_vague: false,
          },
        ],
      }),
    );
    await build(d).runRegion('midtown');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { campusSlug: string | null; requiresStudentId: boolean } },
      ]
    )[0];
    expect(arg.data.campusSlug).toBeNull();
    expect(arg.data.requiresStudentId).toBe(false);
  });

  // --- planCrawl bypass tests ---

  it('bypasses planCrawl for operator-verified sources (dealUrl set) and still scrapes', async () => {
    const d = deps({ source: { dealUrl: 'https://shop.com/student-deals' } });
    const out = await build(d).runRegion('atlanta');
    expect(d.gemini.planCrawl).not.toHaveBeenCalled();
    expect(d.firecrawl.scrape).toHaveBeenCalledTimes(1);
    expect(d.prisma.dealCandidate.create).toHaveBeenCalledTimes(1);
    expect(out.candidatesStored).toBe(1);
  });

  it('still calls planCrawl when source has no dealUrl', async () => {
    const d = deps({ source: { dealUrl: null } });
    await build(d).runRegion('atlanta');
    expect(d.gemini.planCrawl).toHaveBeenCalledTimes(1);
  });

  // --- requiresStudentId guard tests ---

  it('stores requiresStudentId false when audience is faculty_staff, even if model returns true', async () => {
    const d = deps();
    d.gemini.extractDeals = jest.fn(
      async (): Promise<GeminiDealExtraction> => ({
        deals: [
          {
            title: 'Faculty Perk',
            merchant: 'Campus Store',
            category: 'campus',
            discount: '10%',
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending' as const,
            verified: false,
            image_url: null as string | null,
            campus_slug: 'gsu' as string | null,
            requires_student_id: true, // model wrongly set this
            audience: 'faculty_staff' as const,
            campus_deal_type: 'campus_perk' as const,
            area_relevance: 0.8,
            concrete_offer_score: 0.9,
            is_vague: false,
          },
        ],
      }),
    );
    await build(d).runRegion('atlanta');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { requiresStudentId: boolean; audience: string } },
      ]
    )[0];
    expect(arg.data.requiresStudentId).toBe(false);
    expect(arg.data.audience).toBe('faculty_staff');
  });

  it('stores requiresStudentId true when audience is students and model returns true', async () => {
    const d = deps({ source: { zoneSlug: 'gsu' } });
    d.gemini.extractDeals = jest.fn(
      async (): Promise<GeminiDealExtraction> => ({
        deals: [
          {
            title: 'Student Ticket',
            merchant: 'Campus Box Office',
            category: 'entertainment',
            discount: '15%',
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending' as const,
            verified: false,
            image_url: null as string | null,
            campus_slug: 'gsu' as string | null,
            requires_student_id: true,
            audience: 'students' as const,
            campus_deal_type: 'ticket' as const,
            area_relevance: 0.8,
            concrete_offer_score: 0.9,
            is_vague: false,
          },
        ],
      }),
    );
    await build(d).runRegion('gsu');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { requiresStudentId: boolean; audience: string; campusDealType: string | null } },
      ]
    )[0];
    expect(arg.data.requiresStudentId).toBe(true);
    expect(arg.data.audience).toBe('students');
    expect(arg.data.campusDealType).toBe('ticket');
  });

  // --- new fields persisted ---

  it('persists audience and campusDealType on the candidate', async () => {
    const d = deps();
    d.gemini.extractDeals = jest.fn(
      async (): Promise<GeminiDealExtraction> => ({
        deals: [
          {
            title: 'BuzzCard Dining Deal',
            merchant: 'GSU Dining',
            category: 'food',
            discount: '5%',
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending' as const,
            verified: false,
            image_url: null as string | null,
            campus_slug: 'gsu' as string | null,
            requires_student_id: false,
            audience: 'campus_community' as const,
            campus_deal_type: 'dining' as const,
            area_relevance: 0.8,
            concrete_offer_score: 0.9,
            is_vague: false,
          },
        ],
      }),
    );
    await build(d).runRegion('atlanta');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { audience: string; campusDealType: string | null } },
      ]
    )[0];
    expect(arg.data.audience).toBe('campus_community');
    expect(arg.data.campusDealType).toBe('dining');
  });

  // --- P2: place linkage ---

  it('sets dealCandidate.placeId from a place-sourced source', async () => {
    const d = deps({ source: { placeId: 'place-123' } });
    await build(d).runRegion('atlanta');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { placeId: string | null } },
      ]
    )[0];
    expect(arg.data.placeId).toBe('place-123');
  });

  it('leaves dealCandidate.placeId null for a non-place (curated) source', async () => {
    const d = deps();
    await build(d).runRegion('atlanta');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        { data: { placeId: string | null } },
      ]
    )[0];
    expect(arg.data.placeId).toBeNull();
  });

  // --- area-aware quality score ---

  it('computes + persists qualityScore, areaRelevance, concreteOfferScore on the candidate', async () => {
    const d = deps();
    await build(d).runRegion('atlanta');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [
        {
          data: { qualityScore: number; areaRelevance: number; concreteOfferScore: number };
        },
      ]
    )[0];
    expect(arg.data.areaRelevance).toBe(0.8);
    expect(arg.data.concreteOfferScore).toBe(0.9);
    expect(arg.data.qualityScore).toBeGreaterThan(50);
  });

  it('scores a vague gift-card offer LOW', async () => {
    const d = deps();
    d.gemini.extractDeals = jest.fn(
      async (): Promise<GeminiDealExtraction> => ({
        deals: [
          {
            title: 'Purchase a Gift Card',
            merchant: 'Shop',
            category: 'services',
            discount: null,
            expiration: null,
            location: null,
            summary: 's',
            confidence: 90,
            verification_status: 'pending',
            verified: false,
            image_url: null,
            campus_slug: null,
            requires_student_id: false,
            audience: 'general',
            campus_deal_type: 'other',
            area_relevance: 0.2,
            concrete_offer_score: 0,
            is_vague: true,
          },
        ],
      }),
    );
    await build(d).runRegion('atlanta');
    const arg = (
      d.prisma.dealCandidate.create.mock.calls[0] as unknown as [{ data: { qualityScore: number } }]
    )[0];
    expect(arg.data.qualityScore).toBeLessThan(15);
  });

  // --- area context threading ---

  it('passes area context to extractDeals (smarter ranking, never fabricates supply)', async () => {
    const d = deps({ source: { zoneSlug: 'gsu' } });
    await build(d).runRegion('gsu');
    const call = (d.gemini.extractDeals.mock.calls as unknown[][])[0]?.[0] as
      | { areaContext?: { regionType: string; campusSlug?: string } }
      | undefined;
    expect(call?.areaContext?.regionType).toBe('campus');
    expect(call?.areaContext?.campusSlug).toBe('gsu');
  });

  it('passes operatorVerified + area context to planCrawl', async () => {
    const d = deps();
    await build(d).runRegion('atlanta');
    const call = (d.gemini.planCrawl.mock.calls as unknown[][])[0]?.[0] as
      | { operatorVerified?: boolean; areaContext?: { regionName: string } }
      | undefined;
    expect(call?.operatorVerified).toBe(false);
    expect(call?.areaContext?.regionName).toBeDefined();
  });

  it('appends the area-context hash to the extraction cache key (busts cache on context change)', async () => {
    const d = deps();
    await build(d).runRegion('atlanta');
    const extractionCacheKey = d.aiCache.getOrGenerate.mock.calls.find(
      (c: unknown[]) => (c[0] as { task: string }).task === 'deal_extraction',
    )?.[0] as { prompt: string } | undefined;
    // url:hash:areaCtxHash → three colon-separated segments.
    expect(extractionCacheKey?.prompt.split(':').length).toBeGreaterThanOrEqual(3);
  });
});
