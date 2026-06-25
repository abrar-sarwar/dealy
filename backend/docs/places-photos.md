# Places photos — real Google Places photos, keyless URLs, API-SAFE

This backend stores **real Google Places photos** for `Place` rows and exposes them
to the iOS client as **keyless, client-loadable URLs**. The map and Explore cards
render the stored URL directly — **no live photo fetching ever happens on app open.**

## How a photo becomes a keyless URL

Google Places API v1 returns a `photos[]` array on a place; each entry has a
`name` like `places/{placeId}/photos/{photoId}` (the *photo reference*). The image
itself is served from:

```
https://places.googleapis.com/v1/{photoName}/media?maxWidthPx=800&key=<API_KEY>
```

That endpoint **302-redirects to a keyless `googleusercontent.com` CDN URL.** We:

1. Call the `media` endpoint **server-side, with the API key**, following the redirect
   (`GooglePlacesClient.resolvePhotoUrl`).
2. Capture the **final redirected URL** (`response.url`) — a keyless CDN link.
3. Store that keyless URL in `Place.primaryPhotoUrl`.

The iOS client only ever sees the keyless `googleusercontent` URL, so **the API key
is never exposed to the client**, and **the client never calls Google** — it loads a
CDN image like any other URL. Logo-type assets (heuristic: URL contains `logo` /
`gps-proxy`) are treated as **not a real photo**: `imageStatus = no_photo`, no
`primaryPhotoUrl`, the logo kept only in `logoUrl`.

## Cost implications (billable)

Both calls in the fetch path are **billable per call**:

- **Place Details** (only when a photo reference isn't already stored) — billed per
  request.
- **Place Photo (`media`)** — billed per request.

So each newly-photographed place costs up to **2 Google calls** (1 if the reference
is already stored from discovery's `places.photos` field mask, which means just the
`media` call). The job counts **every** Google call (`googleCalls` in the run log).

## Caps (API-SAFE) — env config

| Env var | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_PLACES_PHOTOS_ENABLED` | `true` | Master switch; `false` → job is a logged no-op. |
| `PLACES_PHOTO_REFRESH_DAYS` | `30` | A stored photo older than this is re-fetched; fresher ones are skipped. |
| `MAX_PLACE_PHOTO_LOOKUPS_PER_RUN` | `50` | Hard cap on places photographed per single job run. |
| `MAX_PLACE_PHOTOS_PER_REGION` | `100` | Hard cap on total fetched-fresh photos for a region (counts existing fresh ones). |
| `PLACE_PHOTO_TIMEOUT_MS` | `5000` | Per-call timeout for Place Details + `media`. |

The job (`PlacePhotoService.fetchRegionPhotos`) selects **high-value** in-region
places (enriched, has `googlePlaceId`, ordered by rating + cheap/hidden/student
scores), skips places with a **fresh** photo or **no `googlePlaceId`**, and stops at
`min(limit, MAX_PLACE_PHOTO_LOOKUPS_PER_RUN, regionRemaining)`. Timeouts/failures set
`imageStatus = failed` and the run continues.

## Running the job

```
pnpm places:photos <region> [limit]
# e.g. pnpm places:photos gsu 25
```

Run log shape: `{ considered, fetched, skippedFresh, skippedNoSource, noPhoto, failed, googleCalls }`.

## `imageStatus` values

- `none` — never attempted.
- `fetched` — `primaryPhotoUrl` is a real, keyless photo.
- `no_photo` — no usable photo (place had none, or only a logo).
- `failed` — resolution timed out/errored; retried on the next run.
