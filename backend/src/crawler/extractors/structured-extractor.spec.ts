// src/crawler/extractors/structured-extractor.spec.ts
import { StructuredExtractor } from './structured-extractor';

const JSONLD = `<html><head><script type="application/ld+json">
{"@type":"FoodEstablishment","name":"Taco Spot","address":"1 Peachtree St, Atlanta, GA",
 "makesOffer":{"@type":"Offer","name":"$5 Margaritas","price":"5.00","priceCurrency":"USD",
 "validThrough":"2030-01-01"}}
</script></head><body></body></html>`;

describe('StructuredExtractor', () => {
  const ex = new StructuredExtractor();
  it('pulls an Offer from JSON-LD', async () => {
    const { candidates } = await ex.extract(JSONLD, {
      url: 'https://x.test',
      defaultCategorySlug: 'food',
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('$5 Margaritas');
    expect(candidates[0].merchant).toBe('Taco Spot');
    expect(candidates[0].currentPriceMinor).toBe(500n);
    expect(candidates[0].address).toContain('Peachtree');
    expect(candidates[0].extractionPath).toBe('structured');
  });
  it('returns empty candidates for an unstructured page (triggers LLM fallback)', async () => {
    const { candidates } = await ex.extract('<html><body>just prose</body></html>', {
      url: 'https://x.test',
    });
    expect(candidates).toHaveLength(0);
  });
});
