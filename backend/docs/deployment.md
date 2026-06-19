# Deployment

Topology: **two Railway services** (api + worker) + **Supabase** (Postgres/PostGIS, Auth, Storage) + **Railway Redis** + **Meilisearch**.

```
api.dealy.app ──► dealy-api (Railway, Dockerfile, node dist/main.js)
                  dealy-worker (Railway, same image, node dist/worker.main.js)
                       │
   Supabase Postgres (pooled 6543 / direct 5432) · Supabase Auth · Supabase Storage
   Railway Redis (private) · Meilisearch (Railway/Meili Cloud, private)
```

## 1. Supabase
1. Create a project at supabase.com. Region close to users.
2. **Settings → Database**: copy the **pooled** connection string (port 6543, `?pgbouncer=true`) → `DATABASE_URL`; the **direct** string (port 5432) → `DIRECT_DATABASE_URL` (migrations need a direct connection).
3. **Settings → API**: `SUPABASE_URL`, publishable/anon key → `SUPABASE_PUBLISHABLE_KEY`, **service-role/secret key → `SUPABASE_SECRET_KEY` (server only)**. `SUPABASE_JWKS_URL = ${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
4. Enable PostGIS: it's installed by our first migration (`CREATE EXTENSION postgis`). If Supabase restricts that, enable PostGIS from **Database → Extensions** first.
5. **Storage**: create buckets `deal-images`, `business-assets` with explicit policies (no public write).
6. Run the Supabase **database + security advisors** after the schema is applied; enable RLS on every API-exposed table (RLS policies are defense-in-depth — the API already enforces ownership).

## 2. Railway
1. New project → connect this GitHub repo.
2. **Service `dealy-api`**: builder = Dockerfile (`backend/Dockerfile` — `railway.json` sets this), start = `node dist/main.js`, healthcheck = `/health/ready`. Set all env vars (see `.env.example` / §below). Add a **custom domain** → `api.dealy.app` (CNAME per Railway).
3. **Service `dealy-worker`**: same repo/image, **start command override** = `node dist/worker.main.js`, no healthcheck, no public domain.
4. **Redis**: add the Railway Redis plugin → `REDIS_URL` (use the private URL).
5. **Meilisearch**: deploy from the `getmeili/meilisearch` image (or Meili Cloud) on the private network → `MEILISEARCH_HOST`, `MEILISEARCH_MASTER_KEY`.

### Migrations (run once per deploy, never racing)
Migrations must NOT run on every API replica at boot. Run them as a one-off before promoting:
```bash
# Railway one-off (uses DIRECT_DATABASE_URL):
railway run --service dealy-api pnpm prisma migrate deploy
railway run --service dealy-api pnpm seed          # first deploy only
railway run --service dealy-api pnpm search:reindex
```
`numReplicas` for the API is pinned to 1 in `railway.json`; raise it only after moving migrations to an explicit release step. Worker runs a single replica (BullMQ dedupes repeatable jobs).

## 3. Environment variables
Set every required value from [`.env.example`](../.env.example). Production **fails fast** (zod) if `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`, `REDIS_URL`, `MEILISEARCH_HOST`, `MEILISEARCH_MASTER_KEY` are missing when `APP_ENV=production`. Server-only secrets (`SUPABASE_SECRET_KEY`, `MEILISEARCH_MASTER_KEY`, `FIREBASE_*`, `APPLE_*`, `STRIPE_*`) live ONLY on the server — never in the iOS app.

## 4. Connection pooling
Prisma → Supabase: app uses the **pooler** (`DATABASE_URL`, pgbouncer, port 6543); migrations use the **direct** URL (`DIRECT_DATABASE_URL`, port 5432). With pgbouncer in transaction mode keep Prisma's connection limit modest (`?connection_limit=5`).

## 5. Rollback
Railway keeps prior deploys — **Rollback** to the previous image from the dashboard. Migrations are forward-only; a rollback that needs a schema change requires a new compensating migration (never edit an applied migration). Tag releases; deploy production only from a tagged/approved commit.

## 6. Cost / scaling
Start: api 1× small, worker 1× small, Redis + Meili smallest tiers, Supabase free/pro. Scale the API horizontally once migrations are a separate release step; scale the worker by raising `WORKER_CONCURRENCY` before adding replicas.

## 7. CI/CD
`.github/workflows/backend-ci.yml` runs install → generate → lint → typecheck → build → migrate(deploy) → seed → reindex → test → e2e (+ gitleaks) on PRs/main, with native Postgres+Meili+Redis services. Recommended: PR → checks; main → staging; tagged release → production (do not auto-deploy production before staging is green).
