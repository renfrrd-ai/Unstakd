# Unstakd — Product Requirements Document

Nov 18, 2026 · @Renfred

## Overview

Unstakd (unstakd.com) is a personal deployment platform: push a GitHub repo and get a live app at `<app>.unstakd.com` with HTTPS, plus one-click databases. It copies the pxxl.app experience (git deploys, free subdomain, automatic SSL, managed databases, a CLI) but runs on a server I own.

Version 1 has exactly one user, me, and hosts my own projects. Multi-user accounts, billing and public signups wait until it has run my projects reliably for a few months.

**Why build it:** my side projects (Next.js sites, Node APIs, Postgres-backed apps) are spread across hosts with different limits, cold starts and pricing. Unstakd gives me one dashboard and one bill, a VPS. It is also a deep systems project: builds, containers, reverse proxies, TLS and backups.

## Goals and non-goals

The MVP is done when every active project of mine deploys from a git push to a single VPS, with no other host needed.

**Goals**

- Push to the tracked branch and the app is live in under 3 minutes (typical Next.js app, warm cache).
- Every app gets `https://<app>.unstakd.com` automatically; custom domains get TLS without manual steps.
- One-click Postgres and Redis, with nightly backups to Cloudflare R2.
- A failed build or health check never takes down the version that is already live.
- Roll back to any recent deploy in one click, without rebuilding.
- Everything runs on one small VPS.

**Non-goals for v1**

- Other users, teams, public signups or billing.
- Autoscaling, multi-region or Kubernetes.
- Serverless or edge functions.
- A template marketplace.

## Core user flows

Five flows cover everything the MVP must do.

**1. First deploy**

1. Sign in with GitHub (only my account is allowed).
2. Install the Unstakd GitHub App on the repos I want.
3. New project: pick repo and branch; Unstakd detects the framework and port.
4. Add environment variables, then press Deploy.
5. Watch build logs stream live, then open the `<app>.unstakd.com` link.

**2. Push to deploy**

1. A push hits the GitHub webhook and queues a build.
2. The worker builds an image tagged with the commit SHA.
3. A new container starts and must pass its health check.
4. Caddy switches traffic to it; the old container stops after a grace period.
5. If anything fails, the old version keeps serving and I get a notification.

**3. Add a database**

1. New database: pick Postgres or Redis.
2. Unstakd starts it with a persistent volume on a private network.
3. Link it to a project; the connection string is injected as `DATABASE_URL` (or `REDIS_URL`) and the app redeploys.

**4. Custom domain**

1. Add a hostname to a project.
2. Unstakd shows the DNS record to create and checks it.
3. Once DNS resolves, Caddy issues the certificate and the domain goes live.

**5. Roll back**

1. Open the project's Deployments tab.
2. Pick an earlier deploy and press Rollback; its existing image is started, with no rebuild.

## Functional requirements

MVP is the smallest set that lets me move every project over; v1.1 makes daily use comfortable; Later waits for a real need.

| ID | Area | Requirement | Priority |
| --- | --- | --- | --- |
| D1 | Deploys | Create a project from a GitHub repo and branch | MVP |
| D2 | Deploys | Auto-detect the build with Railpack; a Dockerfile in the repo overrides it | MVP |
| D3 | Deploys | Deploy on every push to the tracked branch | MVP |
| D4 | Deploys | Stream build logs live to the dashboard; keep them 30 days | MVP |
| D5 | Deploys | Zero-downtime switch only after the health check passes | MVP |
| D6 | Deploys | Roll back to any of the last 10 images without rebuilding | MVP |
| D7 | Deploys | Manual redeploy and cancel a running build | MVP |
| D8 | Deploys | Preview deploy per pull request at `pr-<n>-<app>.unstakd.com` | v1.1 |
| D9 | Deploys | Static-site mode: Caddy serves the build output, no container | v1.1 |
| D10 | Deploys | Worker and cron processes alongside the web process | Later |
| R1 | Runtime | Env vars per project, encrypted at rest, secrets masked in the UI | MVP |
| R2 | Runtime | Runtime logs: live tail plus the last 24 hours | MVP |
| R3 | Runtime | Restart, stop and standby (stopped to free RAM) per app | MVP |
| R4 | Runtime | CPU and memory limits per container | MVP |
| R5 | Runtime | Configurable health-check path; auto-restart on crash | MVP |
| R6 | Runtime | CPU, RAM and restart charts per app | v1.1 |
| N1 | Domains | Automatic `<app>.unstakd.com` with HTTPS | MVP |
| N2 | Domains | Custom domains with DNS check and automatic TLS | MVP |
| N3 | Domains | www-to-apex redirects | v1.1 |
| B1 | Databases | One-click Postgres and Redis with persistent volumes | MVP |
| B2 | Databases | Link a database to a project, injecting its connection URL | MVP |
| B3 | Databases | Nightly backups to R2, 7-day retention, one-click restore | MVP |
| B4 | Databases | Secure outside access for tools like TablePlus (SSH tunnel) | v1.1 |
| B5 | Databases | MySQL / MariaDB | Later |
| A1 | Platform | GitHub sign-in, limited to an allowlist (just me) | MVP |
| A2 | Platform | CLI: `login`, `init`, `deploy`, `logs`, `env`, `rollback` | v1.1 |
| A3 | Platform | Failed-deploy alerts by email or Discord webhook | v1.1 |
| A4 | Platform | Audit log of deploys and config changes | v1.1 |
| A5 | Platform | Add a second server as a build or run node | Later |

## Architecture

&#91;embedded content: Unstakd architecture · single-node MVP\]

In the MVP, everything except GitHub and your visitors runs on one VPS. The build worker and app containers are the parts that move to extra servers later (A5).

## Tech stack and data model

The stack stays in TypeScript wherever possible and uses proven open-source parts for the hard pieces (builds, TLS, the registry).

| Layer | Choice | Why |
| --- | --- | --- |
| Dashboard + API | Next.js (App Router), TypeScript | Already my main stack; one codebase to start |
| Auth | GitHub OAuth (Auth.js), allowlist | Single user; GitHub is needed anyway for repos |
| Platform database | Postgres + Drizzle ORM | Typed schema and migrations |
| Job queue | Redis + BullMQ | Retries, concurrency limit of 1–2 builds, progress events |
| Builder | Railpack (Railway's open-source successor to Nixpacks) or Dockerfile, via BuildKit | Zero-config detection with layer caching |
| Runtime | Docker Engine, driven by dockerode | Simple, well documented; restart policies survive reboots |
| Proxy + TLS | Caddy, routes added through its admin API | Automatic HTTPS; on-demand TLS for custom domains |
| Wildcard cert | `*.unstakd.com` via Cloudflare DNS challenge | One cert covers every app subdomain |
| Registry | Self-hosted `registry:2` container | Keeps images for instant rollbacks |
| Backups | Cloudflare R2 (S3 API) | Already used for Twoday; cheap egress |
| Server | One Ubuntu VPS, 4 vCPU / 8 GB to start | Enough for builds plus 10–15 small apps |
| CLI | Node, published to npm | Same language as the API client |

**Data model (platform database)**

- **Project**: name, slug (subdomain), repo, branch, build mode (railpack, dockerfile, static), port, health path, CPU/RAM limits, status.
- **Deployment**: project, commit SHA and message, status (queued, building, deploying, live, failed, superseded), image tag, started and finished times, log location.
- **EnvVar**: project, key, encrypted value, secret flag.
- **Domain**: project, hostname, verified time, TLS status.
- **Database**: engine, version, container name, volume, encrypted credentials, backup schedule.
- **DatabaseLink**: database, project, env key it injects.
- **Backup**: database, R2 object key, size, created time.
- **AuditEvent**: action, target, details, time.

## Custom domains

A custom domain works once its DNS points at the VPS, Unstakd marks it verified, and Caddy issues its certificate the first time someone visits it.

**DNS records the user adds.** Every domain points at one stable target, `edge.unstakd.com` (an A record to the VPS), so a server move changes one record.

| Domain type | Record | Value |
| --- | --- | --- |
| Subdomain (`app.mysite.com`) | CNAME | `edge.unstakd.com` |
| Apex (`mysite.com`) | A | VPS IP (or CNAME flattening on Cloudflare) |

**Flow**

1. I add a hostname to a project; it is saved as a Domain with status `pending`.
2. The dashboard shows the record to create.
3. A background job resolves the hostname about every minute; once it reaches the VPS, the status becomes `verified`.
4. The API adds a Caddy route for that hostname through the admin API, proxying to the project's container.
5. On the first HTTPS request, Caddy calls the `ask` endpoint (`/api/internal/domain-allowed`), which returns 200 only for verified domains, then issues the certificate.
6. Status becomes `active`. The job keeps re-checking DNS; a domain that stops pointing here is flagged, and deleting a domain removes its route.

**Rules**

- On-demand TLS always goes through the `ask` check, so stray domains pointed at the server cannot trigger certificates or hit Let's Encrypt rate limits.
- Once other users exist, ownership also needs a TXT record (`_unstakd.<domain>` = a random token), so no one can claim a domain they don't control.
- Domains behind Cloudflare's proxy need SSL mode "Full (strict)"; the dashboard recommends "DNS only".
- Each project picks a primary hostname; www and apex variants redirect to it (N3).
- Domain statuses: `pending`, `verified`, `active`, `misconfigured`.

## Non-functional requirements

Security matters most here, because the platform holds the Docker socket and every secret I have.

**Security**

- Verify every GitHub webhook signature; drop unsigned requests.
- Encrypt env vars and DB credentials with AES-256-GCM; the master key lives in a file outside the database and outside backups.
- Only the API and build worker reach the Docker socket; app containers never do.
- App containers run as non-root, unprivileged, with CPU/RAM limits.
- Databases sit on a private Docker network and are never published to the internet.
- Firewall allows only 22, 80 and 443; SSH is key-only.
- The dashboard sits behind GitHub sign-in, optionally also behind Cloudflare Access.

**Reliability**

- The live version keeps serving until a new one passes its health check.
- Caddy, the platform and all apps come back on their own after a reboot.
- The platform database is backed up nightly to R2 like any user database.
- A setup script can rebuild the whole server from a fresh VPS plus the backups.

**Performance and housekeeping**

- Typical Next.js build under 3 minutes with cache; dashboard pages load under 1 second.
- Prune old images (keep the last 10 per app), build logs after 30 days and runtime logs after 24 hours, so the disk never fills.

## Milestones

Five phases, each ending with something I can actually use; week counts are estimates for part-time work alongside courses.

1. **Foundations (week 1).** Harden the VPS, install Docker and Caddy, point `*.unstakd.com` at it, deploy one container by hand with a script.
   - Done when: a hello-world app loads at `test.unstakd.com` over HTTPS.
2. **Deploy engine (weeks 2–3).** Platform schema, BullMQ worker, Railpack builds, local registry, Caddy routes through the admin API.
   - Done when: one API call with a repo URL makes the app live.
3. **Dashboard and GitHub (weeks 4–5).** Sign-in, GitHub App, push-to-deploy, live logs, env vars, health checks, rollback.
   - Done when: my portfolio site redeploys on every push.
4. **Databases and domains (weeks 6–7).** Postgres and Redis, linking, R2 backups and restore, custom domains.
   - Done when: one real project with a database moves off its current host.
5. **Hardening and CLI (week 8 on).** CLI, alerts, metrics, preview deploys, audit log.
   - Done when: three projects run for 30 days without me touching the server.

## Success metrics, risks and open questions

Success means I stop using other hosts for my own projects.

**Metrics**

- 100% of my active projects hosted on Unstakd.
- Median push-to-live under 3 minutes.
- Zero deploys that cause downtime.
- Monthly hosting cost no higher than what I pay across hosts today.

**Risks**

| Risk | Mitigation |
| --- | --- |
| One VPS is a single point of failure | Nightly backups to R2 plus a rebuild script; test a full restore once a month |
| Builds run arbitrary code next to the Docker socket | v1 builds only my repos; builder runs in its own container with no host mounts |
| Open-source tools (Coolify, Dokploy, CapRover) already do this | Decide early: build from scratch to learn, or build the UI on top of one |
| Scope creep toward a public product before it is stable | Hold multi-user work until the phase 5 "done when" is met |
| Disk fills with images and logs | Prune rules in the non-functional requirements |

**Open questions**

- Will Unstakd become a public product? That changes auth, isolation, abuse handling and billing.
- Should apps live on a separate domain, the way pxxl serves apps from `pxxl.pro`? It keeps app cookies away from the dashboard's domain; this matters once other people deploy.
- Which VPS provider and region, given most visitors are near Toronto?
- Keep the API inside Next.js, or split it into its own service once the worker grows?
- Is the `unstakd` name free on npm and GitHub?

**Sources:** [pxxl on GitHub](https://github.com/pxxlspace) · [pxxl overview on DEV](https://dev.to/honour_5dfc0a78dcc0e0fd91/pxxl-app-the-best-nigerian-and-african-alternative-to-vercel-render-and-netlify-344k)
