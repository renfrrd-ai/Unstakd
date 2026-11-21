# Waiting on you

Everything here needs an account, a key, a server or a decision only you can make. The code for
each is already in place unless it says otherwise.

## 1. Sign-in (GitHub OAuth app)
Until this is set, only the local "Continue as dev user" button works (and only under `next dev`).

1. GitHub → Settings → Developer settings → OAuth Apps → New.
2. Callback URL: `https://<dashboard host>/api/auth/callback` (for local: `http://localhost:3000/api/auth/callback`).
3. Put `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `ALLOWED_GITHUB_LOGINS=<your login>` in `.env`.

## 2. Push-to-deploy and private repos (GitHub App)
Built; needs the App created on GitHub. Without it, public repos still work and push-to-deploy
needs a webhook per repo (Settings → Webhooks: URL `https://dash.unstakd.com/api/webhooks/github`,
JSON, secret = `GITHUB_WEBHOOK_SECRET`, push events).

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App:
   - Homepage `https://unstakd.com`; Setup URL `https://dash.unstakd.com/api/github/setup`
     (tick "Redirect on update"); no callback URL needed.
   - Webhook active, URL `https://dash.unstakd.com/api/webhooks/github`, secret = the same
     `GITHUB_WEBHOOK_SECRET` as in `.env`.
   - Repository permissions: Contents read-only, Metadata read-only, Pull requests read-only.
   - Events: Push, Pull request. Installable on: any account (so it can go on organisations).
2. Note the App ID, generate a private key (.pem), install the App on your account/orgs.
3. On the VPS: copy the .pem to `/var/lib/unstakd/github-app.pem` (`chmod 600`), set
   `GITHUB_APP_ID=<id>` and `GITHUB_APP_KEY_FILE=/var/lib/unstakd/github-app.pem`, restart.
4. Server → GitHub App should say Connected. Remove per-repo webhooks afterwards (duplicates are
   ignored either way).

## 3. The VPS
1. Decided: **OVHcloud VPS**, Beauharnois (BHS, Canada) region, Ubuntu 24.04, 4 vCPU / 8 GB.
   Unstakd itself runs on this VPS (it needs the Docker socket); Cloudflare is DNS only.
   Dashboard: **dash.unstakd.com** → `.env`: `APP_URL=https://dash.unstakd.com`,
   `DASHBOARD_HOST=dash.unstakd.com`, `APPS_DOMAIN=unstakd.com`, `EDGE_HOST=edge.unstakd.com`,
   `EDGE_IP=<VPS IPv4>`. GitHub OAuth callback: `https://dash.unstakd.com/api/auth/callback`.
2. DNS (Cloudflare, "DNS only"/grey cloud):
   - `A  edge.unstakd.com → <VPS IP>`
   - `A  *.unstakd.com    → <VPS IP>` (or CNAME to edge)
   - `A  dash.unstakd.com → <VPS IP>` (also covered by the wildcard, but explicit is clearer)
3. Cloudflare API token with Zone → DNS → Edit for unstakd.com → `CF_API_TOKEN` (wildcard cert).
4. On the VPS: `sudo bash scripts/setup-vps.sh <git URL of this repo>`, fill in the `.env` it
   generates, run it again.
5. **Copy `/var/lib/unstakd/master.key` to your password manager.** Without it, env vars and
   database passwords can't be decrypted, even from backups.

## 3b. Auto-redeploy on push to main
`.github/workflows/deploy.yml` SSHes into the VPS after every push to main and runs
`scripts/redeploy.sh` (pull, build, migrate, restart dashboard + worker). Until the secrets below
exist the workflow just fails; redeploy by hand with `sudo bash /opt/unstakd/scripts/redeploy.sh`.

1. On your laptop: `ssh-keygen -t ed25519 -N '' -C unstakd-deploy -f unstakd-deploy`.
2. On the VPS, append the public key to `/root/.ssh/authorized_keys`, locked to the script:
   ```
   restrict,command="/opt/unstakd/scripts/redeploy.sh" ssh-ed25519 AAAA… unstakd-deploy
   ```
   (`restrict` turns off port forwarding, a terminal and agent forwarding; `command=` makes the
   script the only thing this key can run.) Then `chmod +x /opt/unstakd/scripts/redeploy.sh`.
3. GitHub repo → Settings → Environments → New environment `production`, then add secrets:
   - `DEPLOY_HOST`: the VPS IP (not dash.unstakd.com, in case Cloudflare proxying changes)
   - `DEPLOY_USER`: `root` (optional; it's the default)
   - `DEPLOY_SSH_KEY`: the contents of the private key `unstakd-deploy`
   - `DEPLOY_KNOWN_HOSTS`: the output of `ssh-keyscan -t ed25519 <VPS IP>`
4. Delete the local private key, then Actions → Deploy → Run workflow to test it.

The VPS pulls with `git merge --ff-only`, so a commit made directly on the server stops deploys
until it's removed (the run fails loudly instead of overwriting it). If the repo is private, the
VPS's clone needs a read-only deploy key or token, the same one it used for the first clone.

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
container), `getting-started` (Railpack), `vitesse` (a static Vite site), `home` (the marketing site, a Next.js static export), databases `e2e-pg` and `e2e-redis`. `pnpm db:seed` resets the database rows (it
doesn't remove containers; delete those from the dashboard first).
