import { buildAreaContext, areaContextHash, type AreaInventoryInput } from './area-context';

const metroInventory: AreaInventoryInput = {
  regionSlug: 'atlanta',
  regionName: 'Atlanta',
  regionType: 'metro',
  latitude: 33.749,
  longitude: -84.388,
  radiusMiles: 15,
};

describe('buildAreaContext', () => {
  it('classifies a campus zone with campus regionType, campusSlug, and student-community focus', () => {
    const ctx = buildAreaContext(
      { ...metroInventory, regionSlug: 'gsu', regionName: 'GSU Zone', regionType: 'metro' },
      { zoneSlug: 'gsu', kind: 'restaurant', defaultCategorySlug: 'food' },
    );
    expect(ctx.regionType).toBe('campus');
    expect(ctx.campusSlug).toBe('gsu');
    expect(ctx.campusName).toBe('Georgia State University');
    expect(ctx.audienceFocus).toBe('campus_community');
    expect(ctx.desiredCategories).toEqual(expect.arrayContaining(['food', 'student', 'campus']));
  });

  it('sets audienceFocus students for a student_discount source on a campus zone', () => {
    const ctx = buildAreaContext(null, { zoneSlug: 'gt', kind: 'student_discount' });
    expect(ctx.regionType).toBe('campus');
    expect(ctx.audienceFocus).toBe('students');
    expect(ctx.campusSlug).toBe('gt');
  });

  it('treats a metro region as general with consumer categories', () => {
    const ctx = buildAreaContext(metroInventory, {
      zoneSlug: 'atlanta',
      kind: 'restaurant',
      defaultCategorySlug: 'food',
    });
    expect(ctx.regionType).toBe('metro');
    expect(ctx.audienceFocus).toBe('general');
    expect(ctx.campusSlug).toBeUndefined();
    expect(ctx.desiredCategories).toEqual(
      expect.arrayContaining(['food', 'groceries', 'entertainment', 'services']),
    );
  });

  it('derives sourceGoal per source kind', () => {
    expect(
      buildAreaContext(metroInventory, { zoneSlug: 'atlanta', kind: 'grocery_circular' })
        .sourceGoal,
    ).toBe('groceries');
    expect(
      buildAreaContext(metroInventory, { zoneSlug: 'atlanta', kind: 'restaurant' }).sourceGoal,
    ).toBe('restaurants');
    expect(
      buildAreaContext(metroInventory, { zoneSlug: 'gt', kind: 'student_discount' }).sourceGoal,
    ).toBe('student discounts');
    expect(
      buildAreaContext(metroInventory, {
        zoneSlug: 'atlanta',
        kind: null,
        sourceType: 'merchant_site',
      }).sourceGoal,
    ).toBe('local deals');
  });

  it('carries lat/lng/radius from inventory', () => {
    const ctx = buildAreaContext(metroInventory, { zoneSlug: 'atlanta', kind: 'restaurant' });
    expect(ctx.latitude).toBe(33.749);
    expect(ctx.longitude).toBe(-84.388);
    expect(ctx.radiusMiles).toBe(15);
  });
});

describe('areaContextHash', () => {
  const ctx = buildAreaContext(metroInventory, { zoneSlug: 'atlanta', kind: 'restaurant' });

  it('is stable for the same context', () => {
    expect(areaContextHash(ctx)).toBe(areaContextHash({ ...ctx }));
  });

  it('changes when regionSlug changes', () => {
    expect(areaContextHash({ ...ctx, regionSlug: 'savannah' })).not.toBe(areaContextHash(ctx));
  });

  it('changes when desiredCategories change', () => {
    expect(areaContextHash({ ...ctx, desiredCategories: ['food'] })).not.toBe(areaContextHash(ctx));
  });

  it('changes when audienceFocus changes', () => {
    expect(areaContextHash({ ...ctx, audienceFocus: 'students' })).not.toBe(areaContextHash(ctx));
  });

  it('changes when sourceGoal changes', () => {
    expect(areaContextHash({ ...ctx, sourceGoal: 'groceries' })).not.toBe(areaContextHash(ctx));
  });

  it('is unaffected by coordinates/radius (cache stays warm on geocoding refinement)', () => {
    expect(areaContextHash({ ...ctx, latitude: 0, longitude: 0, radiusMiles: 99 })).toBe(
      areaContextHash(ctx),
    );
  });
});
