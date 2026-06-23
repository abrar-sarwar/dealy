// src/crawler/extractors/llm-extractor.spec.ts
import { LlmExtractor } from './llm-extractor';

const fakeJson = JSON.stringify({
  deals: [{
    title: 'Student Tuesday', merchant: 'Campus Cafe', categorySlug: 'food',
    address: '50 Decatur St, Atlanta, GA', price: '7.50',
    startDate: null, endDate: '2030-01-01', isStudentOnly: true, couponCode: null,
  }],
});

describe('LlmExtractor', () => {
  it('maps the model JSON to candidates with extractionPath=llm', async () => {
    const ex = new LlmExtractor({ client: { complete: async () => fakeJson } });
    const { candidates } = await ex.extract('<html>prose</html>', { url: 'https://x.test' });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('Student Tuesday');
    expect(candidates[0].currentPriceMinor).toBe(750n);
    expect(candidates[0].isStudentOnly).toBe(true);
    expect(candidates[0].extractionPath).toBe('llm');
  });
  it('returns no candidates when unconfigured', async () => {
    const ex = new LlmExtractor({});
    expect((await ex.extract('<html/>', { url: 'https://x.test' })).candidates).toEqual([]);
  });
  it('tolerates malformed model output', async () => {
    const ex = new LlmExtractor({ client: { complete: async () => 'not json' } });
    expect((await ex.extract('<html/>', { url: 'https://x.test' })).candidates).toEqual([]);
  });
});
