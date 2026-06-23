import { StudentProgramsProvider } from './student-programs.provider';

describe('StudentProgramsProvider', () => {
  const provider = new StudentProgramsProvider();

  it('is an editorial, always-available provider', () => {
    expect(provider.name).toBe('student-programs');
    expect(provider.trust).toBe('editorial');
    expect(provider.isAvailable()).toBe(true);
  });

  it('returns only real, online, student-only programs with https official URLs', async () => {
    const deals = await provider.fetch();
    expect(deals.length).toBeGreaterThanOrEqual(13);
    for (const d of deals) {
      expect(d.isOnline).toBe(true);
      expect(d.isStudentOnly).toBe(true);
      expect(d.destinationUrl).toMatch(/^https:\/\//);
      expect(d.sourceUrl).toMatch(/^https:\/\//);
      expect(d.currentPriceMinor).toBeNull();
      expect(d.originalPriceMinor).toBeNull();
      expect(d.locationTags).toEqual(['online', 'nationwide']);
      expect(d.externalId.startsWith('student-')).toBe(true);
    }
  });

  it('sets redemptionBrand only for physical-redemption programs', async () => {
    const deals = await provider.fetch();
    const brands = deals
      .filter((d) => d.redemptionBrand !== null)
      .map((d) => d.redemptionBrand)
      .sort();
    expect(brands).toEqual(['Apple Store', 'Best Buy', 'Microsoft Store']);
  });

  it('has unique externalIds', async () => {
    const deals = await provider.fetch();
    const ids = deals.map((d) => d.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('confirms a known program and invalidates an unknown one on verify', async () => {
    const deals = await provider.fetch();
    const ok = await provider.verify({
      externalId: deals[0].externalId,
      expiresAt: deals[0].expiresAt,
    });
    expect(ok.status).toBe('confirmed');
    const gone = await provider.verify({
      externalId: 'student-nonexistent',
      expiresAt: new Date(Date.now() + 1e9),
    });
    expect(gone.status).toBe('invalid');
  });
});
