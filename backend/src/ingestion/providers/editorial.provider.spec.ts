import { EditorialProvider } from './editorial.provider';
import { isPilotCategory, validateNormalizedDeal } from '../normalized-deal';
import { EDITORIAL_DEALS } from './editorial-deals';

describe('EditorialProvider', () => {
  const provider = new EditorialProvider();

  it('is always available (no credentials required)', () => {
    expect(provider.isAvailable()).toBe(true);
  });

  it('emits valid, physical, pilot-category deals with provenance', async () => {
    const deals = await provider.fetch();
    expect(deals.length).toBeGreaterThanOrEqual(20);
    for (const d of deals) {
      expect(() => validateNormalizedDeal(d)).not.toThrow();
      expect(d.isOnline).toBe(false);
      expect(d.latitude).not.toBeNull();
      expect(d.longitude).not.toBeNull();
      expect(isPilotCategory(d.categorySlug)).toBe(true);
      expect(d.sourceUrl).toBeTruthy();
      expect(d.providerAttribution).toBeTruthy();
      expect(d.externalId.startsWith('editorial-')).toBe(true);
    }
  });

  it('excludes records flagged removed from fetch()', async () => {
    const deals = await provider.fetch();
    const removedIds = EDITORIAL_DEALS.filter((d) => d.removed).map((d) => `editorial-${d.id}`);
    for (const id of removedIds) {
      expect(deals.find((d) => d.externalId === id)).toBeUndefined();
    }
  });

  it('confirms a current deal on re-verification', async () => {
    const sample = (await provider.fetch())[0];
    const result = await provider.verify({
      externalId: sample.externalId,
      expiresAt: sample.expiresAt,
    });
    expect(result.status).toBe('confirmed');
  });

  it('reports expired when the offer window has lapsed', async () => {
    const sample = (await provider.fetch())[0];
    const result = await provider.verify({
      externalId: sample.externalId,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(result.status).toBe('expired');
  });

  it('reports invalid when the source no longer lists the offer', async () => {
    const result = await provider.verify({
      externalId: 'editorial-does-not-exist',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(result.status).toBe('invalid');
  });
});
