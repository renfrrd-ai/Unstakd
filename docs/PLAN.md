# Build plan

How we get from an empty repo to the MVP in [PRD.MD](../PRD.MD). Each step ends in commits and
leaves the app runnable. Things that need the owner (accounts, keys, a VPS) are in
[LATER.md](LATER.md).

## Decisions

- **Build from scratch** (not on top of Coolify/Dokploy), per the PRD's learning goal.
- **One Next.js app** for dashboard + API; the **worker is a separate process** (`pnpm worker`)
  sharing `src/lib`, `src/db` and `src/server`, so long builds never block web requests and it
  can move to another server later (A5).
- **Auth without Auth.js**: one allowlisted user needs only the OAuth code exchange and a sealed
  cookie (`iron-session`).
- **UI**: look from "Terminal Night + Signal" (dark/light), structure from "Direction B"
  ([DESIGN.md](DESIGN.md)).
- **Logs**: the worker appends to a file per deploy and mirrors lines to Redis; the dashboard
  streams them over SSE. Runtime logs stream straight from Docker.
- **Secrets**: AES-256-GCM, master key in a file (`UNSTAKD_KEY_FILE`), never in the DB.
- **Caddy is configured only through its admin API** (one route per project, `@id` = `app-<slug>`);
  the worker re-applies routes on start.
- **Images stay in the local Docker image store** for rollbacks; `REGISTRY` enables pushing to a
  registry (needed only for multi-server, A5).
- **Backups** go to Cloudflare R2 when configured, otherwise to a local folder.

## Status

### Done
- [x] Docs, design system, scaffold (Next 16, Tailwind 4), dark/light theme
- [x] Platform schema + migrations + seed; AES-256-GCM secrets
- [x] GitHub sign-in with allowlist (dev sign-in when no OAuth app is configured)
- [x] Dashboard: Projects (home), Databases, Activity, Server; project Overview, Deployments,
  deploy detail with live build logs, runtime Logs, Environment, Domains, Databases, Settings;
  New project and New database flows
- [x] Deploy engine: clone → Dockerfile/Railpack build → start (limits, private network) →
  health check → Caddy switch → retire old container after 30s. Failures keep the live version;
  rollback reuses images; cancel; redeploy; standby/start; delete with teardown
- [x] Push-to-deploy webhook (signature-verified, de-duplicated)
- [x] Databases: one-click Postgres/Redis, link/unlink, usage meters, nightly + manual backups,
  restore, retention, platform DB backup
- [x] Custom domains: DNS verification job, statuses, route sync, on-demand TLS ask endpoint
- [x] Housekeeping: prune images (keep 10) and build logs (30 days), route reconcile on start
- [x] Production: Dockerfile, `docker-compose.prod.yml`, Caddy with Cloudflare DNS, VPS setup script

Verified locally: zero-downtime redeploy (400/400 requests OK), failed health check keeps the old
version serving, rollback live in 2s, backup→damage→restore for Postgres and Redis.

### Needs the owner (see LATER.md)
- [ ] GitHub OAuth app + GitHub App (private repos, repo picker)
- [ ] VPS, DNS, Cloudflare token, R2 bucket; first production run

### v1.1 (from the PRD)
- [ ] Preview deploys per PR (D8)
- [ ] Static-site mode (D9)
- [x] Runtime metrics: CPU and memory charts (24h) and crash restarts per app (R6)
- [x] www ↔ apex redirects to the primary domain (N3)
- [x] SSH tunnel access for database tools: loopback-only port + instructions (B4)
- [ ] CLI (A2)
- [x] Alerts to Discord / any webhook (A3); email waits on SMTP credentials

## Definition of done for each step
- `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
- New UI checked in dark **and** light mode and at phone width.
- Committed as one or more focused commits.
