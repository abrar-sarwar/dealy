import {
  currentHash,
  mapEnrichment,
  FEED_SECTION_VOCAB,
  type PlaceCoreInputs,
  type RawPlaceEnrichment,
} from './place-enrichment.types';

const base: PlaceCoreInputs = {
  name: 'Joe Coffee',
  categorySlug: 'food',
  priceLevel: 2,
  rating: 4.5,
  userRatingsTotal: 312,
  address: '1 Edgewood Ave, Atlanta, GA',
};

describe('currentHash', () => {
  it('is stable for identical inputs', () => {
    expect(currentHash(base)).toBe(currentHash({ ...base }));
  });

  it('changes when price level changes', () => {
    expect(currentHash(base)).not.toBe(currentHash({ ...base, priceLevel: 3 }));
  });

  it('changes when rating changes', () => {
    expect(currentHash(base)).not.toBe(currentHash({ ...base, rating: 4.4 }));
  });

  it('changes when name changes', () => {
    expect(currentHash(base)).not.toBe(currentHash({ ...base, name: 'Jane Coffee' }));
  });

  it('treats null vs unchanged consistently (null is stable)', () => {
    const withNulls: PlaceCoreInputs = { ...base, priceLevel: null, rating: null };
    expect(currentHash(withNulls)).toBe(currentHash({ ...withNulls }));
  });
});

describe('mapEnrichment', () => {
  const raw: RawPlaceEnrichment = {
    price_bucket: '$$',
    student_value_score: 0.8,
    affordability_score: 0.7,
    best_for: '  quick lunch  ',
    vibe_tags: ['cozy', 'cozy', 'casual'],
    category_tags: ['coffee'],
    why_recommended: 'Great value coffee near campus.',
    confidence_label: 'high',
    deal_likelihood_score: 0.4,
    hidden_gem_score: 0.2,
    cheap_eats_score: 0.9,
    feed_section_candidates: ['cheap_eats', 'student_friendly'],
  };

  it('maps a raw enrichment to persistable fields', () => {
    const f = mapEnrichment(raw);
    expect(f.priceBucket).toBe('$$');
    expect(f.studentValueScore).toBe(0.8);
    expect(f.cheapEatsScore).toBe(0.9);
    expect(f.bestFor).toBe('quick lunch'); // trimmed
    expect(f.vibeTags).toEqual(['cozy', 'casual']); // deduped
    expect(f.confidenceLabel).toBe('high');
    expect(f.feedSectionCandidates).toEqual(['cheap_eats', 'student_friendly']);
  });

  it('constrains feedSectionCandidates to the fixed vocabulary', () => {
    const f = mapEnrichment({
      ...raw,
      feed_section_candidates: ['cheap_eats', 'made_up_section', 'trending'],
    });
    expect(f.feedSectionCandidates).toEqual(['cheap_eats', 'trending']);
    for (const s of f.feedSectionCandidates) {
      expect(FEED_SECTION_VOCAB).toContain(s);
    }
  });

  it('clamps scores to [0,1] and drops invalid enums', () => {
    const f = mapEnrichment({
      ...raw,
      student_value_score: 1.7,
      affordability_score: -0.5,
      price_bucket: 'cheap' as unknown as string,
      confidence_label: 'maybe' as unknown as string,
    });
    expect(f.studentValueScore).toBe(1);
    expect(f.affordabilityScore).toBe(0);
    expect(f.priceBucket).toBeNull();
    expect(f.confidenceLabel).toBeNull();
  });
});
