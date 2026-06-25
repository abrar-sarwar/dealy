/**
 * PlacePhotoService — capped, batch resolution of REAL Google Places photos to
 * keyless, client-loadable CDN URLs. API-SAFE: every Google call is counted and
 * the run stops at the configured caps. NEVER called on app open (the iOS client
 * reads the stored `primaryPhotoUrl`), only from the `places:photos` job/scheduler.
 */

/** The subset of Place columns the photo job reads (value-ranking + freshness). */
export interface PhotoPlace {
  id: string;
  googlePlaceId: string | null;
  name: string;
  rating: number | null;
  cheapEatsScore: number | null;
  hiddenGemScore: number | null;
  studentValueScore: number | null;
  enrichedAt: Date | null;
  primaryPhotoReference: string | null;
  imageStatus: string;
  photoFetchedAt: Date | null;
}

export interface PlacePhotoConfig {
  enabled: boolean;
  refreshDays: number;
  maxLookupsPerRun: number;
  maxPhotosPerRegion: number;
  timeoutMs: number;
}

export interface PlacePhotoLog {
  region: string;
  disabled: boolean;
  /** Places examined for this run (high-value, in-region). */
  considered: number;
  /** Photos successfully fetched + stored as a usable image. */
  fetched: number;
  /** Skipped because a fresh photo already exists (within refresh window). */
  skippedFresh: number;
  /** Skipped because the place has no googlePlaceId to look up. */
  skippedNoSource: number;
  /** Places resolved to a logo / no usable photo (imageStatus=no_photo). */
  noPhoto: number;
  /** Resolution failures (imageStatus=failed); the run continues past these. */
  failed: number;
  /** Total billable Google calls made (Place Details + photo media). */
  googleCalls: number;
}

/** Prisma surface this service needs — kept narrow for easy unit testing. */
export interface PlacePhotoPrisma {
  place: {
    findMany(args: unknown): Promise<PhotoPlace[]>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

/** Places client surface (photo paths only). */
export interface PlacePhotoClient {
  placeDetails(
    placeId: string,
    timeoutMs?: number,
  ): Promise<{ photoReference: string | null; photoAttribution: string | null } | null>;
  resolvePhotoUrl(
    photoReference: string,
    maxWidthPx: number,
    timeoutMs?: number,
  ): Promise<{ url: string; isLogo: boolean } | null>;
}

/** Width requested from the photo CDN — large enough for retina cards/markers. */
const PHOTO_MAX_WIDTH_PX = 800;

export class PlacePhotoService {
  constructor(
    private readonly prisma: PlacePhotoPrisma,
    private readonly places: PlacePhotoClient,
    private readonly config: PlacePhotoConfig,
  ) {}

  async fetchRegionPhotos(
    regionSlug: string,
    opts: { limit?: number } = {},
  ): Promise<PlacePhotoLog> {
    const log: PlacePhotoLog = {
      region: regionSlug,
      disabled: false,
      considered: 0,
      fetched: 0,
      skippedFresh: 0,
      skippedNoSource: 0,
      noPhoto: 0,
      failed: 0,
      googleCalls: 0,
    };

    if (!this.config.enabled) {
      log.disabled = true;
      console.log(`[places:photos] disabled (GOOGLE_PLACES_PHOTOS_ENABLED=false) — no-op`);
      return log;
    }

    // High-value places in the region, ordered by feed/map value so the cap is
    // spent on what the map/Explore actually surfaces first.
    const places = await this.prisma.place.findMany({
      where: { regionSlug },
      orderBy: [
        { enrichedAt: { sort: 'desc', nulls: 'last' } },
        { rating: { sort: 'desc', nulls: 'last' } },
        { cheapEatsScore: { sort: 'desc', nulls: 'last' } },
        { hiddenGemScore: { sort: 'desc', nulls: 'last' } },
        { studentValueScore: { sort: 'desc', nulls: 'last' } },
      ],
    });

    log.considered = places.length;

    // Region cap accounts for photos ALREADY fetched-fresh in this region.
    const alreadyFresh = places.filter((p) => this.isFresh(p)).length;
    const regionRemaining = Math.max(0, this.config.maxPhotosPerRegion - alreadyFresh);

    const runCap = Math.min(
      opts.limit ?? Number.POSITIVE_INFINITY,
      this.config.maxLookupsPerRun,
      regionRemaining,
    );

    const refreshMs = this.config.refreshDays * 24 * 60 * 60 * 1000;

    for (const p of places) {
      if (log.fetched >= runCap) break;

      if (this.isFresh(p, refreshMs)) {
        log.skippedFresh += 1;
        continue;
      }
      if (!p.googlePlaceId) {
        log.skippedNoSource += 1;
        continue;
      }

      try {
        // Reuse a stored photo reference; only spend a Place Details call when missing.
        let reference = p.primaryPhotoReference;
        let attribution: string | null = null;
        if (!reference) {
          log.googleCalls += 1;
          const details = await this.places.placeDetails(p.googlePlaceId, this.config.timeoutMs);
          reference = details?.photoReference ?? null;
          attribution = details?.photoAttribution ?? null;
        }

        if (!reference) {
          await this.prisma.place.update({
            where: { id: p.id },
            data: { imageStatus: 'no_photo', primaryPhotoUrl: null, photoFetchedAt: new Date() },
          });
          log.noPhoto += 1;
          continue;
        }

        log.googleCalls += 1;
        const resolved = await this.places.resolvePhotoUrl(
          reference,
          PHOTO_MAX_WIDTH_PX,
          this.config.timeoutMs,
        );

        if (!resolved) {
          await this.prisma.place.update({
            where: { id: p.id },
            data: { imageStatus: 'failed', photoFetchedAt: new Date() },
          });
          log.failed += 1;
          continue;
        }

        if (resolved.isLogo) {
          // A logo isn't a "real photo" — keep it as a secondary signal only.
          await this.prisma.place.update({
            where: { id: p.id },
            data: {
              imageStatus: 'no_photo',
              primaryPhotoReference: reference,
              primaryPhotoUrl: null,
              logoUrl: resolved.url,
              photoAttribution: attribution,
              photoSource: 'google_places',
              photoFetchedAt: new Date(),
            },
          });
          log.noPhoto += 1;
          continue;
        }

        await this.prisma.place.update({
          where: { id: p.id },
          data: {
            imageStatus: 'fetched',
            primaryPhotoReference: reference,
            primaryPhotoUrl: resolved.url,
            photoAttribution: attribution,
            photoSource: 'google_places',
            photoFetchedAt: new Date(),
          },
        });
        log.fetched += 1;
      } catch (err) {
        // API-SAFE: a single failure never aborts the run.
        try {
          await this.prisma.place.update({
            where: { id: p.id },
            data: { imageStatus: 'failed', photoFetchedAt: new Date() },
          });
        } catch {
          /* swallow secondary write failure */
        }
        log.failed += 1;
        console.warn(`[places:photos] failed for ${p.name} (${p.id}): ${String(err)}`);
      }
    }

    console.log(`[places:photos] ${regionSlug}`, JSON.stringify(log));
    return log;
  }

  /** A place has a fresh, usable photo if it was fetched within the refresh window. */
  private isFresh(
    p: PhotoPlace,
    refreshMs = this.config.refreshDays * 24 * 60 * 60 * 1000,
  ): boolean {
    if (p.imageStatus !== 'fetched' || !p.photoFetchedAt) return false;
    return Date.now() - p.photoFetchedAt.getTime() < refreshMs;
  }
}
