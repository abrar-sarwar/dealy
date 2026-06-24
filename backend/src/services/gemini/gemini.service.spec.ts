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
