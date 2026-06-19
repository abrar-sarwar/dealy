# Dealy Backend

Production API for Dealy — NestJS (Fastify) · Prisma · PostgreSQL + PostGIS ·
Redis/BullMQ · Meilisearch · Supabase Auth/Storage.

See [`docs/`](./docs) for architecture, decisions, data model, providers, security,
deployment, mobile integration, TestFlight, and the phase-by-phase progress log.

## Prerequisites
- Node ≥ 20.11 (repo developed on Node 22 LTS in CI; Node 25 works locally)
- pnpm 10.x
- A container runtime (Docker Desktop, colima, or Railway in prod)

## Local development
```bash
cd backend
cp .env.example .env          # fill in as needed; DATABASE_URL works out of the box for local
pnpm install
pnpm db:up                    # starts Postgres+PostGIS, Redis, Meilisearch (compose)
pnpm prisma:migrate           # applies migrations to the local DB
pnpm start:dev                # API on http://localhost:3000  (docs at /docs)
```

Health: `GET /health/live` (liveness), `GET /health/ready` (DB-checked readiness).

## Scripts
| Script | Purpose |
|---|---|
| `pnpm build` | Nest build |
| `pnpm start` / `pnpm start:worker` | Run API / worker process |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` | Jest unit tests |
| `pnpm db:up` / `pnpm db:down` | Local backing services |
| `pnpm prisma:migrate` / `pnpm prisma:deploy` | Migrate (dev / prod) |

## Security posture (summary)
Server-only secrets never reach the iOS app. Supabase JWTs verified server-side;
RLS enabled on every exposed table; money stored as integer minor units; PostGIS
for all geo queries. Full threat model in [`docs/security.md`](./docs/security.md).
