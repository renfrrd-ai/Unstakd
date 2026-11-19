# Build plan

How we get from an empty repo to the MVP in [PRD.MD](../PRD.MD). Each step ends in one or
more commits and leaves the app runnable. Check items off as they land.

## Decisions

- **Build from scratch** (not on top of Coolify/Dokploy), per the PRD's learning goal.
- **One Next.js app** holds the dashboard and API. The build/deploy **worker is a separate
  Node process** (`pnpm worker`) sharing `src/lib` and `src/db`, so it can move to another
  server later (A5) and long builds never block web requests.
- **Pluggable runtime adapters**: `docker`, `caddy`, `registry` and `builder` live behind
  small modules in `src/server/`; the dashboard never touches the Docker socket directly.
- **Logs**: the worker appends build/runtime lines to a log file per deployment and
  publishes them on Redis; the dashboard streams them with Server-Sent Events.
- **Secrets**: AES-256-GCM, master key read from a file (`UNSTAKD_KEY_FILE`), never the DB.
- **Theme**: CSS variables + Tailwind, cookie-persisted choice, dark by default. See
  [DESIGN.md](DESIGN.md).
- **Local dev** runs Postgres + Redis in Docker Compose (Postgres on 5434 to avoid clashes).
  Caddy and the registry run in Compose too, so the full deploy path works on a laptop
  with `*.localhost` subdomains.

## Steps

### 0 · Docs
- [x] Rename PRD, add CLAUDE.md, DESIGN.md, this plan; keep the UI template in `docs/design`.

### 1 · Scaffold and design system
- [ ] Next.js (App Router, TS strict), Tailwind, ESLint, pnpm, `.env.example`.
- [ ] Theme tokens, fonts, no-flash theme cookie, `ThemeToggle`.
- [ ] UI primitives: Button, Pill, Panel, List, Input, Field, LogViewer, StatCard, BrandMark.
- [ ] App shell: top bar (brand, main nav, server badge, theme toggle, avatar) and project
  header (breadcrumb, status, actions, tabs).

### 2 · Data layer
- [ ] `docker-compose.dev.yml`: Postgres, Redis.
- [ ] Drizzle schema for every PRD entity (Project, Deployment, EnvVar, Domain, Database,
  DatabaseLink, Backup, AuditEvent) + first migration + seed script with sample data.
- [ ] `crypto.ts` (AES-256-GCM) with tests.

### 3 · Auth
- [ ] Auth.js GitHub provider, allowlist via `ALLOWED_GITHUB_LOGINS`, middleware guarding
  everything except `/login`, webhooks and internal endpoints.

### 4 · Dashboard screens (on real data)
- [ ] Overview: hero (apps up / needs attention), server stats, project list, activity.
- [ ] New project: repo + branch picker, detection result, subdomain/port/health/size,
  env editor (with `.env` paste), "create Postgres" option.
- [ ] Project overview + domains; Deployments list; Environment; Settings.
- [ ] Deploy detail: step track, build/runtime log tabs (SSE), "still live" panel.
- [ ] Databases and Activity pages.

### 5 · Deploy engine (PRD milestone 2)
- [ ] BullMQ queue + worker process, concurrency 1–2, cancel support.
- [ ] Clone at SHA → build with Railpack (or Dockerfile) via BuildKit → push to registry.
- [ ] Start container (non-root, CPU/RAM limits, private network, restart policy).
- [ ] Health check → Caddy route switch via admin API → stop old after grace period.
- [ ] Failures keep the old version live; statuses and step timings recorded.
- [ ] Rollback to any of the last 10 images; manual redeploy; restart/stop/standby.

### 6 · GitHub integration (PRD milestone 3)
- [ ] GitHub App: installation repos list, clone tokens.
- [ ] Push webhook with signature verification → queue deploy for the tracked branch.

### 7 · Databases and domains (PRD milestone 4)
- [ ] Provision Postgres/Redis containers with volumes on the private network.
- [ ] Link to project → inject `DATABASE_URL`/`REDIS_URL` → redeploy.
- [ ] Nightly backups to R2, 7-day retention, restore.
- [ ] Custom domains: DNS check job, Caddy route, `/api/internal/domain-allowed` ask
  endpoint, statuses `pending → verified → active / misconfigured`.

### 8 · Ops
- [ ] Production Compose (app, worker, Postgres, Redis, Caddy, registry).
- [ ] `scripts/setup-vps.sh`: firewall, SSH hardening, Docker, wildcard DNS cert.
- [ ] Housekeeping jobs: prune images (keep 10), build logs (30d), runtime logs (24h).
- [ ] Platform DB backup to R2.

### Later (v1.1 per PRD)
Preview deploys, static-site mode, CLI, alerts, metrics charts, audit log UI, www→apex.

## Definition of done for each step
- `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
- New UI checked in **both** dark and light mode and at phone width.
- Committed as one or more focused commits.
