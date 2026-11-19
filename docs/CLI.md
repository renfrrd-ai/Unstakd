# Unstakd CLI

`cli/unstakd.mjs` is a single Node 20+ script with no dependencies. It talks to the dashboard's
`/api/v1` with a bearer token.

## Setup

1. Dashboard → **Server → API tokens** → create a token (shown once).
2. Put the CLI on your PATH: `pnpm link --global` in this repo, or copy the file.
3. `unstakd login https://unstakd.com` and paste the token. It's saved to
   `~/.config/unstakd/config.json` (mode 600). `UNSTAKD_URL` / `UNSTAKD_TOKEN` override it (CI).

## Commands

| Command | What it does |
|---|---|
| `unstakd init` | Link the current git repo to the project that deploys it (`.unstakd.json`). |
| `unstakd projects` | List projects with health and URL. |
| `unstakd status [project]` | Live version and the last 10 deploys. |
| `unstakd deploy [project] [--detach]` | Redeploy the branch head and stream the build log. Exits 1 if it fails. |
| `unstakd logs [project] [number]` | Follow a deploy's build log (latest by default). |
| `unstakd rollback [project] [number]` | Roll back to `#number`, or to the last good deploy before the live one. |
| `unstakd env [project]` | List env vars. Secret values are never returned. |
| `unstakd env set [project] K=V… [--plain]` | Set vars (secret unless `--plain`). Redeploy to apply. |
| `unstakd env rm [project] K…` | Remove vars. |

`[project]` can be left out inside a repo linked with `unstakd init`.

## API

All routes need `Authorization: Bearer unst_…`; errors are `{ "error": "…" }`.

| Route | |
|---|---|
| `GET /api/v1/projects` | Projects with health, URL, live and latest deploy |
| `GET /api/v1/projects/:slug` | One project plus its last 10 deploys (previews excluded) |
| `POST /api/v1/projects/:slug/deploy` | Queue a deploy of the branch head |
| `POST /api/v1/projects/:slug/rollback` | Body `{ "number"?: n }` |
| `GET / PUT / DELETE /api/v1/projects/:slug/env` | PUT `{ "vars": {K: V}, "secret"?: bool }`, DELETE `{ "keys": [K] }` |
| `GET /api/v1/deployments/:id` | Deploy status |
| `GET /api/v1/deployments/:id/logs?after=N` | Log lines from N, `next`, and `done` once finished |

Tokens are stored as SHA-256 hashes; revoking one on the Server page takes effect immediately.
