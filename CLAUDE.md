# Unstakd

Personal deployment platform: push a GitHub repo, get `https://<app>.unstakd.com`, plus
one-click Postgres/Redis. Single user (the owner), one VPS.

- Requirements: [PRD.MD](PRD.MD) — read the relevant section before building a feature.
- Build order and status: [docs/PLAN.md](docs/PLAN.md) — tick items off as they land.
- UI: [docs/DESIGN.md](docs/DESIGN.md) — tokens, type, parts. Reference markup for each
  screen is in [docs/design/screens/](docs/design/screens/); match it.

## Stack

Next.js App Router + TypeScript (strict) · Tailwind · Auth.js (GitHub, allowlist) ·
Postgres + Drizzle · Redis + BullMQ · Docker via dockerode · Railpack/BuildKit ·
Caddy admin API · `registry:2` · Cloudflare R2. Package manager: **pnpm**.

## Layout

- `src/app` — routes. `(dashboard)` pages, `api/` route handlers, `login/`.
- `src/components` — `ui/` primitives, `layout/` shells, feature folders.
- `src/db` — Drizzle schema, migrations, seed.
- `src/lib` — code safe for both web and worker (env, crypto, redis, queue names).
- `src/server` — server-only adapters (docker, caddy, registry, builder, github).
- `src/worker` — BullMQ worker entry and job handlers; runs as its own process.

## Commands

```bash
pnpm dev:services   # Postgres (5434) + Redis via docker compose
pnpm db:migrate     # apply migrations;  pnpm db:seed for sample data
pnpm dev            # dashboard on :3000
pnpm worker         # deploy worker
pnpm typecheck && pnpm lint && pnpm test
```

## Rules

- **Theme**: every color comes from a token (`bg-panel`, `text-muted`, …). Never hardcode
  hex values in components. Check new UI in dark *and* light mode and at phone width.
- **Security** (the platform holds the Docker socket and every secret):
  - Verify GitHub webhook signatures; reject unsigned requests.
  - Env vars and DB credentials are AES-256-GCM encrypted; the key comes from
    `UNSTAKD_KEY_FILE`, never from the DB. Never log secret values; mask them in the UI.
  - Only `src/server` / the worker talk to Docker. App containers run non-root with limits.
  - Pass user input to Docker/git as argument arrays, never via shell strings.
- **Reliability**: a failed build or health check must never stop the live version.
- Validate at boundaries (forms, webhooks, external APIs) with zod; trust internal code.
- Tests hit real Postgres/Redis from the dev compose stack, not mocks.

## Git

Small, logical commits as features land: `type(scope): subject` with types
`feat`, `fix`, `refactor`, `docs`, `test`, `chore`. Don't commit `.env*` (except
`.env.example`) or key files.
