# Unstakd

Personal deployment platform: push a GitHub repo, get `https://<app>.unstakd.com`, plus
one-click Postgres/Redis. Single user (the owner), one VPS.

- Requirements: [PRD.MD](PRD.MD) — read the relevant section before building a feature.
- Status and decisions: [docs/PLAN.md](docs/PLAN.md). Things waiting on the owner: [docs/LATER.md](docs/LATER.md).
- UI: [docs/DESIGN.md](docs/DESIGN.md) — tokens, type, parts; reference markup per screen in
  [docs/design/screens/](docs/design/screens/). Look = Terminal Night (dark/light), structure = Direction B.

## Stack

Next.js 16 App Router (Cache Components on) + TypeScript (strict) · Tailwind 4 · GitHub OAuth
(allowlist, iron-session) · Postgres + Drizzle · Redis + BullMQ · Docker via dockerode ·
Dockerfile/Railpack builds · Caddy admin API · Cloudflare R2 (S3 API). Package manager: **pnpm**.

## Layout

- `src/app` — routes. `(main)` = pages with the top bar; `projects/[slug]` = project tabs;
  `new` = New project; `api/` = auth, webhooks, SSE log streams, Caddy's `internal/domain-allowed`.
- `src/components` — `ui/` primitives, `layout/` shells, `forms/ActionForm`, feature folders.
- `src/db` — Drizzle schema, migrations, seed.
- `src/lib` — safe anywhere (env, crypto, queue names, log format, validation, status).
- `src/server` — server/worker code: docker, caddy, builder, git, databases, backups, queries
  (queries/session use `server-only`; the worker must not import those).
- `src/worker` — BullMQ worker: `deploy.ts` (pipeline), `ops.ts` (all other jobs), schedulers in `index.ts`.

## Commands

```bash
cp .env.example .env.local && pnpm key:generate   # first run only
pnpm dev:services   # Postgres (5434), Redis (6380), Caddy (apps :8080, admin :2019), BuildKit (:1234)
pnpm db:generate    # after editing src/db/schema.ts (then commit the migration)
pnpm db:migrate     # apply migrations;  pnpm db:seed resets rows to sample data
pnpm dev            # dashboard on :3000
pnpm worker         # deploy/ops worker (restart it after changing worker or server code)
pnpm check          # typecheck + lint (no warnings) + tests; run before every commit
```

Deployed apps are reachable at `http://<slug>.localhost:8080` in dev. Repos without a Dockerfile
build with Railpack: install the CLI on your PATH (`~/.local/bin/railpack`, release binary) and
keep `BUILDKIT_HOST=tcp://127.0.0.1:1234` in `.env.local`.

## Rules

- **Next.js 16 differs from older versions** (Proxy instead of Middleware, Cache Components,
  generated `PageProps`/`LayoutProps`/`RouteContext`). Read `node_modules/next/dist/docs/` before
  using an API you haven't used here. Request-time reads (cookies, DB, env) go inside
  `<Suspense>`; GET route handlers start with `await connection()` or the build tries to
  prerender them.
- **Forms**: server actions return `FormState`; use `ActionForm` + `SubmitButton` (no render
  props from server components).
- **Theme**: every color comes from a token (`bg-panel`, `text-muted`, …). Never hardcode hex
  values in components. Check new UI in dark *and* light mode and at phone width.
- **Security** (the platform holds the Docker socket and every secret):
  - Verify GitHub webhook signatures; reject unsigned requests.
  - Env vars and DB credentials are AES-256-GCM encrypted; the key comes from
    `UNSTAKD_KEY_FILE`, never from the DB. Never log secret values; mask them in the UI.
  - Pass user input to Docker/git as argument arrays, never via shell strings.
  - Destructive actions need a confirm (ConfirmButton or type-the-name).
- **Reliability**: a failed build or health check must never stop the live version.
- Validate at boundaries (forms, webhooks, external APIs) with zod; trust internal code.
- Tests hit real Postgres/Redis/Docker from the dev stack, not mocks.

## Local quirks

- Docker here is the snap package: its CLI can't read `/tmp` or hidden folders (`.data`), so CLI
  output into those comes back empty. The app uses the Docker API, so it's unaffected.
- This host rejects `no-new-privileges`; `.env.local` sets `DOCKER_NO_NEW_PRIVILEGES=false`.

## Git

Small, logical commits as features land: `type(scope): subject` with types
`feat`, `fix`, `refactor`, `docs`, `test`, `chore`. Don't commit `.env*` (except
`.env.example`) or key files.
