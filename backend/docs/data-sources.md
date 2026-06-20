# Dealy — Deal & Data Source Integration Guide (Atlanta MVP, 2025–2026)

> Researched + web-verified June 2026. **Honesty first:** this doc marks what you can *actually integrate* vs. what requires a partnership/sales motion vs. what has **no API at all**. Volatile facts (pricing, rate limits) are flagged where they couldn't be fully confirmed — verify in each provider's live dashboard before depending on a number. Supersedes the earlier `providers.md`.

## The single most important takeaway

A deal app's content splits into **three buildable layers**, and only two are engineering:

1. **Events — real free APIs.** Build this FIRST (Ticketmaster, SeatGeek, campus Localist). **Affiliate revenue comes later, only after you're approved into a network + the advertiser** — it is not day-one.
2. **Local listings + retail deals — real APIs, mind the ToS.** (Google Places for *listings* only; Best Buy / Kroger for deals; Awin/CJ/Impact for coupons once approved.)
3. **Food deals + student discounts — NO API exists.** Editorial curation + local sales + a verification gate (SheerID). This is go-to-market, not integration — keep it off the critical path.

---

## ⚡ What to actually do this weekend (don't block testing on approvals)

You proposed getting keys for: Google Places, Mapbox, Yelp, Amazon Associates, Impact, CJ. Corrected:

| Your pick | Verdict | Why |
|---|---|---|
| Google Cloud → Places + Geocoding | ✅ **Keep — for listings, not deals** | Best business-*listing* backbone; instant key. ⚠️ It has **no deals** and ToS limits caching (see below) — use it to enrich locations, not as a `DealProvider` |
| **Mapbox** | ❌ **Drop** | Your **iOS app already uses MapKit**; Mapbox is infra (no ratings/hours/photos, no deals). Not needed for the MVP |
| **Yelp Fusion** | ❌ **Drop for now** | Removed its always-free tier; now paid (exact pricing/trial limits **unverified** — docs cite daily caps like ~300/day), **no deals endpoint**, attribution pushes users off your funnel |
| **Amazon Associates** | ⚠️ **Later, not now** | Sales-gated (need prior sales before keys), **no coupon codes / no all-deals feed**, and **PA-API was *already* deprecated (May 15 2026)** → Creators API. A curated product/price source *later* |
| Impact.com | ✅ **Keep — apply now** | The monetization hub (Walmart, Target, Best Buy, Ticketmaster, SeatGeek), but approval takes days–weeks; don't block on it |
| CJ Affiliate | ✅ **Keep — apply now** | Best coupon-flagging + 100M-product catalog; publisher approval takes days |

**The plan:**
- **Get free, instant keys now (unblock testing today):** ① **Ticketmaster Discovery** ② **Best Buy** ③ **Google Places (New) + Geocoding** *(listings/enrichment — NOT a deal source).*
- **Apply in parallel but DON'T block testing:** Impact.com, CJ, Awin (publisher + per-advertiser approval takes days–weeks; usable coupon codes only arrive after advertiser approval).
- **Skip:** Yelp (paid), Mapbox (iOS uses MapKit). **Amazon:** later. Add **SheerID** when you build the student gate.
- **Until affiliate access lands:** seed the feed with **editorial deals** (food/student) via the admin endpoint.

---

# Full source catalog

Difficulty is 1 (trivial) – 5 (hard). "MVP fit" = use it for an Atlanta launch now.

## 1 · Location / Places APIs (infrastructure — not deals, not revenue)

### Google Places API (New) + Geocoding — listings/enrichment backbone (NOT a deal source)
- **Site / docs:** https://mapsplatform.google.com · https://developers.google.com/maps/documentation/places/web-service/overview
- **Approval:** none, instant — **but a billing account is mandatory** (+$300/90-day trial credit for new accounts).
- **Cost:** ⚠️ **As of Mar 1 2025 the old ~$200/mo flat credit was removed**, replaced by **per-SKU monthly free caps** (Essentials 10k, Pro 5k, Enterprise 1k). Per-1k after that: Place Details Essentials $5 / Pro $17; Text+Nearby Search $32/$35; Geocoding $5. **The field mask drives the SKU/price** — request only what you need.
- **Rate limits:** per-method, per-project, tunable in Cloud Console → Quotas (no single published QPS). *(flagged)*
- **Data:** listings, hours, categories (`types`), ratings, reviews, photos, `priceLevel`, geo, phone, website. **No deals.**
- ⚠️ **Caching/ToS — important:** Google's policy generally lets you **persistently store only the `place_id`**; other content (name, rating, hours, geo) has **caching limits + attribution requirements** and cannot be cached indefinitely. Don't architect a permanent Places mirror — store Place IDs, fetch other fields on demand (short-lived caching only), and show required attribution.
- **Auth:** API key (`X-Goog-Api-Key` header). **Keys:** Cloud Console → project → enable billing → enable "Places API (New)" + "Geocoding API" → Credentials → create + restrict key.
- **Difficulty 2/5 · MVP fit: YES for *listings/enrichment*, but it is NOT a `DealProvider`.**
```bash
curl -X POST 'https://places.googleapis.com/v1/places:searchText' \
  -H 'Content-Type: application/json' -H 'X-Goog-Api-Key: KEY' \
  -H 'X-Goog-FieldMask: places.displayName,places.location,places.rating,places.priceLevel,places.currentOpeningHours,places.types' \
  -d '{"textQuery":"coffee near Georgia State University Atlanta"}'
```
```json
{"places":[{"displayName":{"text":"Some Café"},"location":{"latitude":33.753,"longitude":-84.386},
  "rating":4.6,"priceLevel":"PRICE_LEVEL_INEXPENSIVE","types":["cafe","coffee_shop"],
  "currentOpeningHours":{"openNow":true}}]}
```

### Foursquare Places API — best category/price taxonomy
- **Site/docs:** https://foursquare.com/products/places-api · https://docs.foursquare.com/developer · new base `https://places-api.foursquare.com`
- **Approval:** none, instant. **Cost:** 10,000 free Pro calls/mo (Premium fields — photos/ratings/tips — not free). ⚠️ **Two conflicts flagged:** legacy V3 sunsets **May 15 2026** (build on the new API); the free allowance (10k on pricing page vs 500 in "upcoming changes," **Jun 1 2026**) and a disputed "$200 credit" need live confirmation.
- **Rate limits:** 50 QPS (PAYG/Sandbox). **Auth:** Service Key as `Authorization: Bearer` **+ `X-Places-Api-Version: YYYY-MM-DD`** header.
- **Data:** 100M POIs, best-in-class categories, hours, price tier; premium ratings/popularity/photos. **Bonus: Foursquare "OS Places" was open-sourced (2025, Apache-2.0)** — a free bulk POI dataset (not a live API) good for *seeding* your Atlanta POI universe. No deals.
- **Difficulty 2/5 · MVP fit: optional listings source** (Google Places is enough to start).

### Mapbox — ❌ not needed (iOS uses MapKit)
- **Site/docs:** https://mapbox.com · https://docs.mapbox.com/api/search/
- Your iOS app already renders maps with **MapKit**, so Mapbox adds nothing for the MVP. It's also infra, not content (no ratings/hours/photos/deals on the self-serve tier; rich POI metadata is "contact sales").
- **Difficulty 2/5 · MVP fit: NO** — skip unless you later need cross-platform/custom map styling MapKit can't do.

### Yelp Fusion — ❌ not for a bootstrapped MVP
- **Site/docs:** https://business.yelp.com/data · https://docs.developer.yelp.com
- ⚠️ **Removed its always-free tier.** Now paid plans with **trial limits that vary by plan** (Yelp's docs describe daily caps, e.g. ~300/day). Specific monthly prices ($229+ Base cited in some sources) **could not be fully verified — confirm in the dashboard.** Regardless: **no deals endpoint**, and mandatory attribution + link-back pushes users off your funnel — so **skip for a bootstrapped MVP.**
- **Data:** best restaurant/coffee depth + price tier + review excerpts (tier-gated). **Auth:** Bearer API key. **Difficulty 2/5 technically; commercially NO for MVP.**

## 2 · Affiliate networks (your coupon feeds AND your revenue — all require approval)

> The key question per network: does the API expose **redeemable coupon codes / a promotions feed**, not just product data + tracking links? And note: **none of these pay revenue until you're approved as a publisher AND approved per-advertiser.**

### Awin — real voucher feed, but NOT instant (apply in parallel)
- **Site/docs:** https://awin.com · https://help.awin.com/apidocs/promotions
- **Approval:** publisher app (~24h) + **per-advertiser approval**. `membership: all` lets you *see* promotions from advertisers you haven't joined — **but ⚠️ the actual `voucher.code` is returned `null` until you join + are approved for that advertiser.** So it is **NOT an instant coupon feed**; usable codes appear only for joined advertisers. **Cost:** free + **refundable £5/$5 deposit**. **Rate limit:** 20 calls/min.
- **Data:** voucher promotions (title, terms, dates, tracking URL; **`voucher.code` only once joined**); product feeds (separate datafeed key). **Auth:** OAuth2 Bearer token.
- **Difficulty 2/5 · MVP fit: apply in parallel, don't block — usable codes arrive only after per-advertiser approval.**
```bash
curl -X POST "https://api.awin.com/publishers/PUBID/promotions/" \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"filters":{"membership":"all","status":"active","type":"voucher"},"pagination":{"page":1,"pageSize":100}}'
```
```json
{"data":[{"type":"voucher","advertiser":{"name":"Example Store","joined":false},
  "title":"15% off everything","endDate":"2026-06-30T23:59:59Z",
  "urlTracking":"https://www.awin1.com/cread.php?...",
  "voucher":{"code":null,"exclusive":true}}]}   // code is null until you JOIN + are approved for this advertiser
```

### Impact.com — monetization hub (Walmart, Target, Best Buy, Ticketmaster, SeatGeek)
- **Site/docs:** https://impact.com · https://integrations.impact.com/partner-api-reference
- **Approval:** marketplace (~72h) + **per-brand approval** (the friction — no "all coupons" pull; coverage grows over weeks). **Cost:** free. **Rate limits:** Promotions/Deals/Ads 1,000/hr; Product Search 3,000/hr.
- **Data:** ✅ **Promo Codes / Promotions / Deals / Ads** endpoints with real `GenericRedemptionCode`/`DealDefaultPromoCode`, discount %, dates, tracking + landing URLs; per-brand product catalogs. **Auth:** HTTP Basic (Account SID + Auth Token).
- **Difficulty 2/5 API (4/5 effective, per-brand gating) · MVP fit: apply now, monetize as approvals land.**
```bash
curl --get "https://api.impact.com/Mediapartners/SID/Ads" -u "SID:TOKEN" \
  -H "Accept: application/json" --data-urlencode "Type=COUPON"
```

### CJ Affiliate — best coupon flagging + huge catalog
- **Site/docs:** https://cj.com/publisher · https://developers.cj.com · GraphQL `https://commissions.api.cj.com/query`
- **Approval:** publisher review (days, expects a real site) + per-advertiser approval. ⚠️ **6-month dormancy → $10 fee.** **Cost:** free. **Rate limits:** ~legacy 1k records/call; current GraphQL limits *(flagged)*.
- **Data:** ✅ coupon code + promo type + dates (Link Search / Promotional Properties); **100M+ product catalog incl. non-joined advertisers** for discovery. **Auth:** Personal Access Token (Bearer) + numeric CID.
- **Difficulty 3.5/5 · MVP fit: apply now (slow), great once live.**

### Amazon Associates + PA-API 5.0 → Creators API — ⚠️ already deprecated; later, not now
- **Site/docs:** https://affiliate-program.amazon.com · https://webservices.amazon.com/paapi5/documentation
- ⚠️ **PA-API was *already* deprecated (May 15 2026)** and stopped accepting new customers → use the **Creators API (OAuth2)**. **Access is sales-gated** (PA-API historically needed ~3 sales/180d; Creators reportedly stricter — *flagged*). **No coupon codes; no all-deals feed** (OffersV2 has `Savings`/`DealDetails` per-ASIN only).
- **Rate limits:** start 1 TPS / 8,640 TPD, scales with revenue. **Auth:** SigV4 (PA-API) / OAuth2 (Creators). **Revenue:** 1–4% (up to 10–20% niche), **24h cookie**. **Difficulty 3/5 · MVP fit NO as a coupon engine.**

### Rakuten Advertising — good coupon feed, selective approval
- **Site/docs:** https://rakutenadvertising.com/become-a-publisher · https://developers.rakutenadvertising.com
- **Approval:** ⚠️ genuinely selective — may reject a new low-traffic app. **Cost:** free. **Data:** ✅ Coupon Feed API (codes + dates, **XML, ≤500/call**), Product Search. **Auth:** OAuth2 (60-min token). Net-60 / slow payouts. **Difficulty 4/5 · MVP fit: add once you have traffic.**

### ShareASale — ❌ DEFUNCT
**Closed permanently Oct 6 2025; merged into Awin.** No new signups, API retired. Use Awin.

### Paid coupon aggregators (skip multi-network glue early)
- **Strackr** (https://strackr.com) — ✅ cleanest indie option: aggregates coupons from **65 networks**, auto-expires, REST + CSV, a few €/mo. **Coupomated** — established alternative. ⚠️ You still need your **own network accounts** for commissions to pay out. Avoid any "RetailMeNot/Honey API" on RapidAPI (scrapers).

## 3 · Retail brand APIs

### Best Buy Developer API — ⭐ easiest real retail-deals win
- **Site/docs:** https://developer.bestbuy.com · https://bestbuyapis.github.io/api-documentation/
- **Approval:** instant key **but a business/company email is required** (Gmail/Yahoo blocked). **Cost:** free. **Rate limits:** **5 req/sec, 50k/day.**
- **Data:** ~1M SKUs with `regularPrice`/`salePrice`/`onSale` + an `offers` collection (Deal of the Day, free-shipping, start/end dates), stores, categories. **No "all deals" endpoint** — query `onSale=true` and rank by `regularPrice − salePrice`. **Auth:** `?apiKey=` query param.
- **Affiliate:** via **Impact** (⚠️ Best Buy zeroed affiliate rates briefly in spring 2025 — volatile), **after approval**. **Difficulty 2/5 · MVP fit STRONG (real deals, instant key).**
```bash
curl "https://api.bestbuy.com/v1/products(onSale=true&categoryPath.id=abcat0502000)?show=sku,name,salePrice,regularPrice,onSale,url,offers&format=json&pageSize=10&apiKey=KEY"
```

### Kroger Developer API — ⭐ best Atlanta grocery fit
- **Site/docs:** https://developer.kroger.com · https://developer.kroger.com/reference
- **Approval:** **public tier (Products, Locations, Cart, Identity) is instant + free + self-serve**; **Digital Coupons + Catalog V2 are partner-gated** (email APISupport@kroger.com). **Rate limits:** Products 10k/day, Locations 1,600/day, Cart 5k/day.
- **Data:** product search w/ **per-store pricing** (scoped to `locationId`), store locator, add-to-cart. **Auth:** OAuth2 (client-credentials for products; auth-code+PKCE for cart). **Atlanta:** Kroger runs a dedicated Atlanta Division + owns Harris Teeter in GA.
- **Difficulty 2/5 · MVP fit STRONG** (ship public tier later; apply for coupon partner access in parallel). ⚠️ coupon public/partner split inferred — confirm with Kroger.
```bash
curl -X POST https://api.kroger.com/v1/connect/oauth2/token \
  -H "Authorization: Basic base64(client_id:secret)" -d "grant_type=client_credentials&scope=product.compact"
curl "https://api.kroger.com/v1/locations?filter.zipCode.near=30303&filter.radiusInMiles=10" -H "Authorization: Bearer TOKEN"
```

### Walmart Affiliate Marketing API (v2) — real but gated + fiddly
- **Site/docs:** https://walmart.io/docs/affiliates/v1/affiliate-marketing-api (⚠️ JS-rendered)
- **Approval:** approve into Walmart affiliate **via Impact** first, then register app ("sound business case"). **Cost:** free; earn up to **4%**. **Rate limits:** ~5k/day *(flagged)*.
- **Data:** products w/ `salePrice`/`msrp`, Rollback/Clearance/Special-Buy feeds. **No coupon codes.** **Auth:** ⚠️ **RSA signature** (4 headers, RSA-SHA256, PKCS#1, 180s TTL) — use a wrapper (Python WIOpy). **Difficulty 3.5/5 · MVP fit: later.**

### Target / Costco / Sam's Club — ❌ no usable public API
| Retailer | Public API | Path |
|---|---|---|
| **Target** | NO ("RedCircle"=3rd-party scraper, "RedSky"=internal/ToS) | **Impact affiliate** exposes a real product+promotions feed → else editorial |
| **Costco** | NO | Manual editorial; CJ membership affiliate link only |
| **Sam's Club** | NO (dev portal is ads-only) | Rakuten affiliate + editorial |

## 4 · Food brands — ❌ NO public deal APIs (all four verified)

Every offer is behind a loyalty login, increasingly **AI-personalized per user**, and ToS-protected. Any "McDonald's/Wendy's API" online is a reverse-engineered internal endpoint or scraper — not official, not safe to build on.

| Brand | API | Realistic move |
|---|---|---|
| McDonald's | NO | Editorial entry of public promos + deep-link to app |
| Chick-fil-A | NO | Editorial + deep-link |
| Wendy's | NO (Punchh/Eagle Eye backends) | Editorial of public web offers + deep-link |
| Burger King | NO | Editorial of advertised codes + deep-link |

**This is the model every coupon site uses.** Hand-curate ~20–40 current Atlanta-relevant deals into structured records (brand, title, terms, expiry, app link) and deep-link users into each brand's app to redeem. **Do not scrape gated content.**

## 5 · Coupon "APIs" — myth vs. real
- ❌ **RetailMeNot API:** doesn't exist publicly (RMN is itself an affiliate publisher). ❌ **Honey / Capital One Shopping:** no API (they're browser extensions — your competitors). ❌ **Groupon:** partner API closed 2022; deals now flow via CJ only.
- ✅ **The real, legal coupon source is the affiliate-network promotions feeds above** (Awin/CJ/Impact/Rakuten) + optional aggregator (Strackr) — **all gated by per-advertiser approval.**

## 6 · Student discounts — ❌ no feed API; verification is the only integration
- **UNiDAYS / Student Beans:** closed advertiser-gated networks. **No "GET /offers" feed for you.** Their GitHub libs are partner-side conversion tracking, not inbound feeds. You'd become a *listed brand* (a sales motion), not a consumer of their catalog.
- ✅ **SheerID — the real student-verification API** (gate "student-only" offers): https://developer.sheerid.com · Bearer auth (⚠️ migrate to the new "Applications" model before **Aug 1 2026**) · JS modal ≈ a day · **free Test mode** (any `firstName` succeeds except `"REJECTED"`). Pricing custom *(flagged)*. **Difficulty 2/5.**
- **Student Beans "Beans iD" (Pion)** — real verification product, partial pricing public (Shopify: free+10% / $125/mo+8%); REST docs not public *(flagged)*. Backup to SheerID.
- **Campus offers (GT/GSU/Emory/Spelman/Morehouse):** no API — manual partnerships + editorial. This hyperlocal content is your **moat** (national networks ignore one-off cafés).
```http
POST https://services.sheerid.com/rest/v2/verification   {"programId":"<ID>"}
POST .../verification/{id}/step/collectStudentPersonalInfo
  {"firstName":"Randy","lastName":"Random","birthDate":"2004-05-01","email":"randy@gatech.edu",
   "organization":{"id":1,"name":"Georgia Institute of Technology"}}
→ {"currentStep":"success","rewardCode":"REWARD","segment":"student"}
```

## 7 · Local Atlanta business data
- **Best:** Google Places (breadth/grocery/venues) + Foursquare (categories) for *listings only* — Yelp only if you pay. Respect Google's caching/attribution ToS (store `place_id`, fetch the rest on demand).
- **Atlanta open data** (free enumeration only — no hours/photos/ratings): **ARC** `opendata.atlantaregional.com` ⭐ aggregates member-city business-license point feeds (ArcGIS REST + GeoJSON, no key) — but **suburb-skewed**, license-roll quality. City of Atlanta / Fulton County GIS = parcels/zoning, **no business-listing dataset**. ⚠️ `data.atlantaga.gov` didn't resolve; live hub is `gis.atlantaga.gov`.

## 8 · Events / entertainment — ⭐ the most actionable layer

### Ticketmaster Discovery API — already integrated in this repo
- **Docs:** https://developer.ticketmaster.com · base `https://app.ticketmaster.com/discovery/v2/`
- **Approval:** instant, **free**. **Rate limits:** **5,000 requests/day, 5/second** (deep paging capped: `size×page<1000`). **Auth:** `apikey` query param. Strong Atlanta coverage (State Farm Arena, Mercedes-Benz, Fox, Tabernacle, Hawks/Falcons/United).
- **Affiliate:** via **Impact** — tag the `event.url`; ~5–10% resale *(flagged)* — **requires Impact + Ticketmaster program approval first, not instant.** **Difficulty 1/5 · MVP fit HIGHEST.**

### SeatGeek Platform API — price/"Deal Score" complement
- **Docs:** https://platform.seatgeek.com · base `https://api.seatgeek.com/2/` · `client_id` query param, free. ⚠️ new-partner gating + rate limits *(flagged)*.
- **Data:** events/performers/venues + **pricing stats + "Deal Score"** (on-brand for a deals app). **Affiliate:** via **Impact** too (one account covers TM + SeatGeek, after approval). **Difficulty 2–3/5 · MVP fit GOOD.**

### Campus events via Localist — free structured JSON (tested live)
- **GSU** `https://calendar.gsu.edu/api/2/events` · **GA Tech** `https://calendar.gatech.edu/api/2/events` — no auth, free, `pp≤100`. Docs: developer.localist.com. **Difficulty 1/5.** No revenue, high student engagement.

### Eventbrite — ❌ drop for discovery
**Public event search shut off Feb 2020.** You can only fetch events for orgs you own/manage. No "all Atlanta events." Defer.

---

# Rankings

**Fastest to integrate (instant key, simple auth, no approval):**
1. Ticketmaster Discovery (1/5) · 2. Localist campus events (1/5) · 3. Best Buy (2/5) · 4. Google Places — *listings only* (2/5) · 5. Foursquare (2/5) · 6. Kroger public tier (2/5) · 7. SeatGeek (2–3/5) · 8. SheerID test mode (2/5). Affiliate networks (Awin/Impact/CJ) are gated by approval → not "fast."

**Cheapest:**
Free: Ticketmaster, Best Buy, Kroger public, Localist, Foursquare OS Places (bulk), ARC open data, SheerID test. · Free tier w/ caps: Google Places (per-SKU), Foursquare (10k/mo). · Free + refundable £5: Awin. · **Most expensive / skip for MVP: Yelp** (paid-only; exact price unverified).

**Highest-quality data:**
Listings → Google Places > Foursquare > Yelp. · Coupons → CJ ≈ Awin ≈ Rakuten (real codes+dates, once joined) > Impact. · Retail product/deals → Best Buy ≈ Walmart > Kroger. · Events → Ticketmaster + SeatGeek.

**Best affiliate monetization (all post-approval):**
1. **Impact.com** (one account → Walmart, Target, Best Buy, Ticketmaster, SeatGeek) · 2. CJ (catalog + coupons) · 3. Awin (voucher feed once joined) · 4. Amazon (huge but sales-gated, no coupons) · 5. Rakuten (good, selective/slow).

**Best fit for a startup MVP (overall, actionable now):**
1. Ticketmaster · 2. Best Buy · 3. Google Places *(listings)* · 4. Localist · 5. SeatGeek · 6. Kroger · 7. Foursquare · 8. SheerID. Affiliate networks (Impact/CJ/Awin) = apply now, integrate as approvals land.

---

# Recommended tech stack — you already have most of it

Dealy's backend (NestJS + Fastify + Prisma + PostGIS + BullMQ + Meilisearch) is exactly the right shape. Every **deal** source is just another **`DealProvider`** behind the existing ingestion pipeline — no architecture change.

- **Each *deal* source (Ticketmaster, Best Buy, affiliate promo feeds) → a `DealProvider`** (like `src/ingestion/providers/ticketmaster.provider.ts`): `fetch()` → `NormalizedDeal[]` → validate → dedupe by `fingerprint` → upsert → index in Meilisearch. The BullMQ worker already runs these on a cron.
- **Affiliate links** live on `deal.destinationUrl` (store the Impact/Awin tracking URL **once approved**); `couponCode` holds voucher codes (only present after advertiser approval).
- **Food/editorial deals** → the existing **admin module** (`POST /v1/admin/deals/...`) or a small `EditorialProvider` reading a checked-in JSON/Sheet. No scraping.
- **Local listings (Google Places) is NOT a `DealProvider`** — it's an enrichment source. ⚠️ Per Google's ToS, **persistently store only `place_id`**; fetch name/rating/hours on demand (short-lived caching) with attribution. Use it to enrich a deal's location, not to generate deals.
- **Student gate** → SheerID JS modal in iOS → server stores a `verifiedStudent` flag → unlock `isStudentOnly` deals.
- **Maps** → iOS already uses **MapKit**; no Mapbox needed.
- **Secrets** → all provider keys are server-only env (`TICKETMASTER_API_KEY`, etc.); add `GOOGLE_PLACES_KEY`, `BESTBUY_API_KEY`, `IMPACT_*` as you go. Never ship them in the app.

# The MVP — exact order (get the existing system end-to-end FIRST)

Don't add providers until the spine works against real data on a deployed backend.

1. **Deploy the infra** — Supabase (Postgres/PostGIS + Auth) + Railway (api + worker) + Redis + Meilisearch.
2. **Run the existing Ticketmaster integration against real Atlanta data** — point the provider at Atlanta, run the worker, confirm real events land in `/v1/feeds/nearby` + search.
3. **Connect the iOS app** — swap `MockDealService → RemoteDealService`, set `DEALY_API_ENV`, verify the live feed end-to-end.
4. **Add Best Buy** (free, instant key) as the second `DealProvider` once the spine is solid.
5. **Apply to Awin + Impact + CJ in parallel** — but **don't block testing on approval**; integrate their feeds as access lands.
6. **Editorial seed deals** (food/student, via the admin endpoint) fill the feed until affiliate access arrives.

**Result:** a functioning Atlanta feed = real Ticketmaster events + Best Buy deals + editorial seed deals, with affiliate monetization layered in later as Impact/advertiser approvals complete. No "instant revenue" — that depends entirely on approvals.

---
*All "flagged" items above are pricing/rate-limit/endpoint details that changed recently or sit behind JS-rendered or login-gated docs — confirm them in the live dashboard before depending on a specific number. Per-advertiser commission rates and cookie windows are set individually on every affiliate program and must be read per program.*
