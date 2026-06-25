import { PlacePhotoService, type PhotoPlace, type PlacePhotoConfig } from './place-photo.service';

function place(over: Partial<PhotoPlace> = {}): PhotoPlace {
  return {
    id: over.id ?? 'p1',
    googlePlaceId: 'googlePlaceId' in over ? over.googlePlaceId! : 'gp-1',
    name: over.name ?? 'Cafe',
    rating: over.rating ?? 4.5,
    cheapEatsScore: over.cheapEatsScore ?? 0.5,
    hiddenGemScore: over.hiddenGemScore ?? 0.5,
    studentValueScore: over.studentValueScore ?? 0.5,
    enrichedAt: over.enrichedAt ?? new Date(),
    primaryPhotoReference: 'primaryPhotoReference' in over ? over.primaryPhotoReference! : null,
    imageStatus: over.imageStatus ?? 'none',
    photoFetchedAt: over.photoFetchedAt ?? null,
  };
}

const CONFIG: PlacePhotoConfig = {
  enabled: true,
  refreshDays: 30,
  maxLookupsPerRun: 50,
  maxPhotosPerRegion: 100,
  timeoutMs: 5000,
};

type UpdateArg = { where: { id: string }; data: Record<string, unknown> };
type DetailsResult = { photoReference: string | null; photoAttribution: string | null } | null;
type ResolveResult = { url: string; isLogo: boolean } | null;

function makeDeps(rows: PhotoPlace[]) {
  const findMany = jest.fn(
    async (_args: { where: { regionSlug: string }; orderBy: unknown }) => rows,
  );
  const update = jest.fn<Promise<unknown>, [UpdateArg]>(async () => ({}));
  const prisma = { place: { findMany, update } };
  const placeDetails = jest.fn<Promise<DetailsResult>, [string, number?]>(async () => ({
    photoReference: 'places/gp-1/photos/REF',
    photoAttribution: 'Jane',
  }));
  const resolvePhotoUrl = jest.fn<Promise<ResolveResult>, [string, number, number?]>(async () => ({
    url: 'https://lh3.googleusercontent.com/places/REF=s1600',
    isLogo: false,
  }));
  const places = { placeDetails, resolvePhotoUrl };
  return { prisma, places, findMany, update, placeDetails, resolvePhotoUrl };
}

describe('PlacePhotoService.fetchRegionPhotos', () => {
  it('is a logged no-op when GOOGLE_PLACES_PHOTOS_ENABLED is false', async () => {
    const { prisma, places, findMany, placeDetails } = makeDeps([place()]);
    const svc = new PlacePhotoService(prisma as never, places as never, {
      ...CONFIG,
      enabled: false,
    });
    const log = await svc.fetchRegionPhotos('gsu');
    expect(findMany).not.toHaveBeenCalled();
    expect(placeDetails).not.toHaveBeenCalled();
    expect(log).toMatchObject({ considered: 0, fetched: 0, disabled: true });
  });

  it('fetches a photo using the stored reference (no extra Place Details call)', async () => {
    const { prisma, places, placeDetails, resolvePhotoUrl, update } = makeDeps([
      place({ id: 'p1', primaryPhotoReference: 'places/gp-1/photos/STORED' }),
    ]);
    const svc = new PlacePhotoService(prisma as never, places as never, CONFIG);
    const log = await svc.fetchRegionPhotos('gsu');
    expect(placeDetails).not.toHaveBeenCalled();
    expect(resolvePhotoUrl).toHaveBeenCalledWith(
      'places/gp-1/photos/STORED',
      expect.any(Number),
      CONFIG.timeoutMs,
    );
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data;
    expect(data.imageStatus).toBe('fetched');
    expect(data.primaryPhotoUrl).toContain('googleusercontent.com');
    expect(data.photoSource).toBe('google_places');
    expect(data.photoFetchedAt).toBeInstanceOf(Date);
    expect(log).toMatchObject({ considered: 1, fetched: 1, failed: 0 });
  });

  it('calls Place Details when no photo reference is stored', async () => {
    const { prisma, places, placeDetails } = makeDeps([place({ primaryPhotoReference: null })]);
    const svc = new PlacePhotoService(prisma as never, places as never, CONFIG);
    await svc.fetchRegionPhotos('gsu');
    expect(placeDetails).toHaveBeenCalledWith('gp-1', CONFIG.timeoutMs);
  });

  it('caps lookups at MAX_PLACE_PHOTO_LOOKUPS_PER_RUN', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      place({ id: `p${i}`, googlePlaceId: `gp-${i}` }),
    );
    const { prisma, places, resolvePhotoUrl } = makeDeps(rows);
    const svc = new PlacePhotoService(prisma as never, places as never, {
      ...CONFIG,
      maxLookupsPerRun: 3,
    });
    const log = await svc.fetchRegionPhotos('gsu');
    expect(resolvePhotoUrl).toHaveBeenCalledTimes(3);
    expect(log.fetched).toBe(3);
  });

  it('honours an explicit limit when lower than the run cap', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      place({ id: `p${i}`, googlePlaceId: `gp-${i}` }),
    );
    const { prisma, places, resolvePhotoUrl } = makeDeps(rows);
    const svc = new PlacePhotoService(prisma as never, places as never, CONFIG);
    const log = await svc.fetchRegionPhotos('gsu', { limit: 2 });
    expect(resolvePhotoUrl).toHaveBeenCalledTimes(2);
    expect(log.fetched).toBe(2);
  });

  it('never exceeds MAX_PLACE_PHOTOS_PER_REGION counting already-fetched places', async () => {
    // 1 already fetched (fresh) + 5 pending; region cap = 3 → only 2 more allowed.
    const fresh = place({ id: 'fresh', imageStatus: 'fetched', photoFetchedAt: new Date() });
    const pending = Array.from({ length: 5 }, (_, i) =>
      place({ id: `p${i}`, googlePlaceId: `gp-${i}` }),
    );
    const { prisma, places, resolvePhotoUrl } = makeDeps([fresh, ...pending]);
    const svc = new PlacePhotoService(prisma as never, places as never, {
      ...CONFIG,
      maxPhotosPerRegion: 3,
    });
    const log = await svc.fetchRegionPhotos('gsu');
    expect(resolvePhotoUrl).toHaveBeenCalledTimes(2);
    expect(log.fetched).toBe(2);
  });

  it('skips places whose photo is still fresh (within refresh window)', async () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const { prisma, places, resolvePhotoUrl, update } = makeDeps([
      place({ id: 'fresh', imageStatus: 'fetched', photoFetchedAt: recent }),
    ]);
    const svc = new PlacePhotoService(prisma as never, places as never, CONFIG);
    const log = await svc.fetchRegionPhotos('gsu');
    expect(resolvePhotoUrl).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(log).toMatchObject({ considered: 1, fetched: 0, skippedFresh: 1 });
  });

  it('re-fetches a place whose photo is older than the refresh window', async () => {
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    const { prisma, places, resolvePhotoUrl } = makeDeps([
      place({ id: 'stale', imageStatus: 'fetched', photoFetchedAt: stale }),
    ]);
    const svc = new PlacePhotoService(prisma as never, places as never, CONFIG);
    const log = await svc.fetchRegionPhotos('gsu');
    expect(resolvePhotoUrl).toHaveBeenCalledTimes(1);
    expect(log.fetched).toBe(1);
  });

  it('skips places with no googlePlaceId (no source)', async () => {
    const { prisma, places, placeDetails } = makeDeps([place({ googlePlaceId: null })]);
    const svc = new PlacePhotoService(prisma as never, places as never, CONFIG);
    const log = await svc.fetchRegionPhotos('gsu');
    expect(placeDetails).not.toHaveBeenCalled();
    expect(log).toMatchObject({ considered: 1, fetched: 0, skippedNoSource: 1 });
  });

  it('marks no_photo when the place has no usable photo reference', async () => {
    const { prisma, places, update } = makeDeps([place({ primaryPhotoReference: null })]);
    places.placeDetails = jest.fn<Promise<DetailsResult>, [string, number?]>(async () => ({
      photoReference: null,
      photoAttribution: null,
    }));
    const svc = new PlacePhotoService(prisma as never, places as never, CONFIG);
    const log = await svc.fetchRegionPhotos('gsu');
    expect(update.mock.calls[0][0].data.imageStatus).toBe('no_photo');
    expect(update.mock.calls[0][0].data.primaryPhotoUrl).toBeNull();
    expect(log.fetched).toBe(0);
  });

  it('marks no_photo (keeps logoUrl) when the resolved asset is a logo', async () => {
    const { prisma, places, update } = makeDeps([
      place({ primaryPhotoReference: 'places/gp-1/photos/LOGO' }),
    ]);
    places.resolvePhotoUrl = jest.fn<Promise<ResolveResult>, [string, number, number?]>(
      async () => ({
        url: 'https://lh3.googleusercontent.com/gps-proxy/logo=s200',
        isLogo: true,
      }),
    );
    const svc = new PlacePhotoService(prisma as never, places as never, CONFIG);
    const log = await svc.fetchRegionPhotos('gsu');
    const data = update.mock.calls[0][0].data;
    expect(data.imageStatus).toBe('no_photo');
    expect(data.primaryPhotoUrl).toBeNull();
    expect(data.logoUrl).toContain('logo');
    expect(log.fetched).toBe(0);
  });

  it('marks failed and continues when a resolve throws', async () => {
    const { prisma, places, update } = makeDeps([
      place({
        id: 'bad',
        googlePlaceId: 'gp-bad',
        primaryPhotoReference: 'places/gp-bad/photos/X',
      }),
      place({
        id: 'good',
        googlePlaceId: 'gp-good',
        primaryPhotoReference: 'places/gp-good/photos/Y',
      }),
    ]);
    places.resolvePhotoUrl = jest
      .fn<Promise<ResolveResult>, [string, number, number?]>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ url: 'https://lh3.googleusercontent.com/ok=s1600', isLogo: false });
    const svc = new PlacePhotoService(prisma as never, places as never, CONFIG);
    const log = await svc.fetchRegionPhotos('gsu');
    expect(log.failed).toBe(1);
    expect(log.fetched).toBe(1);
    const badUpdate = update.mock.calls.find((c) => c[0].where.id === 'bad');
    expect(badUpdate?.[0].data.imageStatus).toBe('failed');
  });

  it('queries only the region, ordered by value (rating + scores)', async () => {
    const { prisma, places, findMany } = makeDeps([place()]);
    const svc = new PlacePhotoService(prisma as never, places as never, CONFIG);
    await svc.fetchRegionPhotos('gsu');
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.regionSlug).toBe('gsu');
    expect(Array.isArray(arg.orderBy)).toBe(true);
  });
});
