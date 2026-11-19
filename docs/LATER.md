# Waiting on you

Everything here needs an account, a key, a server or a decision only you can make. The code for
each is already in place unless it says otherwise.

## 1. Sign-in (GitHub OAuth app)
Until this is set, only the local "Continue as dev user" button works (and only under `next dev`).

1. GitHub → Settings → Developer settings → OAuth Apps → New.
2. Callback URL: `https://<dashboard host>/api/auth/callback` (for local: `http://localhost:3000/api/auth/callback`).
3. Put `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `ALLOWED_GITHUB_LOGINS=<your login>` in `.env`.

## 2. Push-to-deploy
Works today with a plain repo webhook:
- Repo → Settings → Webhooks → Add: URL `https://<dashboard host>/api/webhooks/github`,
  content type JSON, secret = `GITHUB_WEBHOOK_SECRET`, events: **Pushes** and **Pull requests**
  (the second only matters if you turn on preview deploys in a project's Settings).

Not built yet, needs your GitHub App: private repos (installation tokens for cloning) and the
repo picker in New project. Today New project takes a public `owner/name`.

## 3. The VPS
1. Pick a provider/region (PRD open question; most visitors near Toronto). 4 vCPU / 8 GB.
2. DNS (Cloudflare, "DNS only"/grey cloud):
   - `A  edge.unstakd.com → <VPS IP>`
   - `A  *.unstakd.com    → <VPS IP>` (or CNAME to edge)
   - `A  <dashboard host> → <VPS IP>`
3. Cloudflare API token with Zone → DNS → Edit for unstakd.com → `CF_API_TOKEN` (wildcard cert).
4. On the VPS: `sudo bash scripts/setup-vps.sh <git URL of this repo>`, fill in the `.env` it
   generates, run it again.
5. **Copy `/var/lib/unstakd/master.key` to your password manager.** Without it, env vars and
   database passwords can't be decrypted, even from backups.

## 4. Off-site backups (Cloudflare R2)
Create a bucket and an API token with Object Read & Write, then set `R2_ENDPOINT`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Until then backups go to
`/var/lib/unstakd/backups` on the same disk, which won't survive losing the server.

## 5. Check on the first production run
These couldn't be exercised on the laptop:
- **HTTPS**: wildcard cert via Cloudflare DNS, and on-demand certs for a custom domain.
- **Railpack builds** inside the worker container through the BuildKit service (verified on the
  laptop with the CLI + a BuildKit container; the image pins Railpack 0.43.0 by checksum).
- **`no-new-privileges`**: this laptop's Docker (snap, AppArmor, kernel 7.0) rejects it, so
  `.env.local` sets `DOCKER_NO_NEW_PRIVILEGES=false`. Leave it unset (on) on the VPS unless
  every container exits with code 255.
- The worker reaches app containers by IP on the `unstakd` network for health checks; confirm
  that works from inside the worker container.

## 6. Alerts
Server → Alerts takes a Discord webhook URL (channel → Integrations → Webhooks) or any URL
that accepts a JSON POST. Email alerts need an SMTP provider (e.g. Resend, Postmark): not built.

## 7. CLI
Works today without publishing: `pnpm link --global` in this repo (or copy `cli/unstakd.mjs`
anywhere on your PATH), then create a token on Server → API tokens and run
`unstakd login https://unstakd.com`. Publishing to npm needs your npm account and the
package name (see below).

## 8. Decisions from the PRD's open questions
- Public product later? (changes auth, isolation, billing)
- Serve apps from a separate domain (like `pxxl.pro`) to keep app cookies off the dashboard's?
- Is `unstakd` free on npm/GitHub (for the CLI)?

## Local dev leftovers
The local database has test data from end-to-end runs: project `hello` (a live hello-world
container), `getting-started` (Railpack), `vitesse` (a static Vite site), databases `e2e-pg` and `e2e-redis`. `pnpm db:seed` resets the database rows (it
doesn't remove containers; delete those from the dashboard first).
