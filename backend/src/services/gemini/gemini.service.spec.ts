import { GeminiService } from './gemini.service';

describe('GeminiService', () => {
  it('extracts deals using structured JSON output and Flash by default', async () => {
    const client = {
      generateJson: jest.fn().mockResolvedValue({
        deals: [
          {
            title: '20% Off Student Discount',
            merchant: 'Merchant Name',
            category: 'Food',
            discount: '20%',
            expiration: null,
            location: null,
            summary: 'Students receive 20% off every Tuesday.',
            confidence: 0.95,
            verification_status: 'verified',
            verified: true,
          },
        ],
      }),
    };
    const service = new GeminiService(client, {
      enabled: true,
      model: 'gemini-2.5-flash',
      reasoningModel: 'gemini-2.5-pro',
      cacheTtlHours: 24,
      escalationMaxConfidence: 60,
      escalationMinReliability: 80,
      enrichRatePerMin: 15,
      enrichBatchSize: 8,
      enrichMaxRetries: 3,
    });

    const result = await service.extractDeals({
      content: 'Students receive 20% off every Tuesday with valid student ID.',
      merchantHint: 'Merchant Name',
      sourceUrl: 'https://merchant.test/deals',
    });

    expect(result.deals[0]).toMatchObject({
      title: '20% Off Student Discount',
      merchant: 'Merchant Name',
      confidence: 0.95,
      verified: true,
    });
    expect(client.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        schema: expect.objectContaining({ type: 'object' }),
      }),
    );
  });

  it('uses the reasoning model for low-confidence verification reasoning', async () => {
    const client = {
      generateJson: jest
        .fn()
        .mockResolvedValue({ verified: false, confidence: 0.42, reason: 'conflict' }),
    };
    const service = new GeminiService(client, {
      enabled: true,
      model: 'gemini-2.5-flash',
      reasoningModel: 'gemini-2.5-pro',
      cacheTtlHours: 24,
      escalationMaxConfidence: 60,
      escalationMinReliability: 80,
      enrichRatePerMin: 15,
      enrichBatchSize: 8,
      enrichMaxRetries: 3,
    });

    await service.reasonAboutVerification({
      candidateSummary: 'Unclear special',
      extractedEvidence: 'maybe discount',
      conflict: 'expiration missing',
    });

    expect(client.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.5-pro' }),
    );
  });
});

const cfg = {
  apiKey: 'k',
  model: 'gemini-2.5-flash',
  reasoningModel: 'gemini-2.5-pro',
  cacheTtlHours: 24,
  enabled: true,
  escalationMaxConfidence: 60,
  escalationMinReliability: 80,
  enrichRatePerMin: 15,
  enrichBatchSize: 8,
  enrichMaxRetries: 3,
};

describe('GeminiService.planCrawl', () => {
  it('returns the structured crawl plan from Flash', async () => {
    const generateJson = jest
      .fn()
      .mockResolvedValue({ crawl: true, reason: 'fresh weekly ad', priority: 8 });
    const svc = new GeminiService({ generateJson }, cfg as never);
    const plan = await svc.planCrawl({
      sourceType: 'weekly_ad',
      url: 'https://shop.com/weekly-ad',
      category: 'groceries',
      reliabilityScore: 70,
      averageDealsFound: 4,
      lastSuccessAt: null,
    });
    expect(plan).toEqual({ crawl: true, reason: 'fresh weekly ad', priority: 8 });
    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.5-flash' }),
    );
  });
});

describe('GeminiService.extractDeals model override', () => {
  it('uses the provided model when escalating to Pro', async () => {
    const generateJson = jest.fn().mockResolvedValue({ deals: [] });
    const svc = new GeminiService({ generateJson }, cfg as never);
    await svc.extractDeals({
      content: 'x',
      sourceUrl: 'https://shop.com/deals',
      model: 'gemini-2.5-pro',
    });
    expect(generateJson).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-2.5-pro' }));
  });
});

describe('GeminiService.extractDeals — schema includes campus_slug + requires_student_id + audience + campus_deal_type', () => {
  it('dealExtractionSchema includes all campus/audience fields in item properties and required', () => {
    let capturedSchema: Record<string, unknown> | undefined;
    const client = {
      generateJson: jest.fn(async (req: { schema: Record<string, unknown> }) => {
        capturedSchema = req.schema;
        return { deals: [] };
      }),
    };
    const svc = new GeminiService(client as never, {
      enabled: true,
      model: 'gemini-2.5-flash',
      reasoningModel: 'gemini-2.5-pro',
      cacheTtlHours: 24,
      escalationMaxConfidence: 60,
      escalationMinReliability: 80,
      enrichRatePerMin: 15,
      enrichBatchSize: 8,
      enrichMaxRetries: 3,
    });
    return svc
      .extractDeals({ content: 'x', sourceUrl: 'https://t.test/s', merchantHint: 'M' })
      .then(() => {
        const items = (
          capturedSchema as {
            properties: {
              deals: { items: { properties: Record<string, unknown>; required: string[] } };
            };
          }
        ).properties.deals.items;
        expect(Object.keys(items.properties)).toContain('campus_slug');
        expect(Object.keys(items.properties)).toContain('requires_student_id');
        expect(Object.keys(items.properties)).toContain('audience');
        expect(Object.keys(items.properties)).toContain('campus_deal_type');
        expect(items.required).toContain('campus_slug');
        expect(items.required).toContain('requires_student_id');
        expect(items.required).toContain('audience');
        expect(items.required).toContain('campus_deal_type');
      });
  });

  it('extraction prompt instructs Gemini to detect student requirements and campus tags', async () => {
    let capturedPrompt = '';
    const client = {
      generateJson: jest.fn(async (req: { prompt: string }) => {
        capturedPrompt = req.prompt;
        return { deals: [] };
      }),
    };
    const svc = new GeminiService(client as never, {
      enabled: true,
      model: 'gemini-2.5-flash',
      reasoningModel: 'gemini-2.5-pro',
      cacheTtlHours: 24,
      escalationMaxConfidence: 60,
      escalationMinReliability: 80,
      enrichRatePerMin: 15,
      enrichBatchSize: 8,
      enrichMaxRetries: 3,
    });
    await svc.extractDeals({ content: 'x', sourceUrl: 'https://t.test/s' });
    expect(capturedPrompt).toContain('requires_student_id');
    expect(capturedPrompt).toContain('campus_slug');
    expect(capturedPrompt).toContain('audience');
    expect(capturedPrompt).toContain('faculty_staff');
    expect(capturedPrompt).toContain('campus_community');
  });

  it('dealExtractionSchema includes area_relevance, concrete_offer_score, is_vague', async () => {
    let capturedSchema: Record<string, unknown> | undefined;
    const client = {
      generateJson: jest.fn(async (req: { schema: Record<string, unknown> }) => {
        capturedSchema = req.schema;
        return { deals: [] };
      }),
    };
    const svc = new GeminiService(client as never, cfg as never);
    await svc.extractDeals({ content: 'x', sourceUrl: 'https://t.test/s' });
    const items = (
      capturedSchema as {
        properties: {
          deals: { items: { properties: Record<string, unknown>; required: string[] } };
        };
      }
    ).properties.deals.items;
    for (const f of ['area_relevance', 'concrete_offer_score', 'is_vague']) {
      expect(Object.keys(items.properties)).toContain(f);
      expect(items.required).toContain(f);
    }
  });
});

const areaCtx = {
  regionSlug: 'gsu',
  regionName: 'Georgia State University',
  regionType: 'campus' as const,
  latitude: 33.753,
  longitude: -84.385,
  radiusMiles: 5,
  desiredCategories: ['food', 'student', 'campus'],
  campusSlug: 'gsu',
  campusName: 'Georgia State University',
  audienceFocus: 'campus_community' as const,
  sourceGoal: 'student discounts',
};

describe('GeminiService — area context threading', () => {
  function capturePrompt() {
    let prompt = '';
    const client = {
      generateJson: jest.fn(async (req: { prompt: string }) => {
        prompt = req.prompt;
        return { deals: [], crawl: true, reason: 'r', priority: 5 };
      }),
    };
    return { client, get: () => prompt };
  }

  it('extractDeals prompt includes the target area/campus and desired categories', async () => {
    const c = capturePrompt();
    const svc = new GeminiService(c.client as never, cfg as never);
    await svc.extractDeals({ content: 'x', sourceUrl: 'https://t.test/s', areaContext: areaCtx });
    expect(c.get()).toContain('Georgia State University');
    expect(c.get()).toContain('campus');
    expect(c.get()).toContain('food');
    expect(c.get()).toContain('NEVER invent');
  });

  it('planCrawl prompt includes the area name, desiredCategories, and operator-verified flag', async () => {
    const c = capturePrompt();
    const svc = new GeminiService(c.client as never, cfg as never);
    await svc.planCrawl({
      sourceType: 'student_discount',
      url: 'https://t.test/deals',
      reliabilityScore: 70,
      averageDealsFound: 3,
      lastSuccessAt: null,
      operatorVerified: false,
      areaContext: areaCtx,
    });
    expect(c.get()).toContain('Georgia State University');
    expect(c.get()).toContain('food');
    expect(c.get()).toContain('Operator-verified source: no');
    expect(c.get()).toContain('AREA + CATEGORY relevance');
  });
});
