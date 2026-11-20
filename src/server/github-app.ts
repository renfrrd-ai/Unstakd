// The Unstakd GitHub App: short-lived installation tokens for cloning private repos, and the list
// of repos it was installed on (the New project picker). Used by the dashboard and the worker.
import { createPrivateKey, createSign, type KeyObject } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

const API = "https://api.github.com";

export function githubAppConfig() {
  const id = process.env.GITHUB_APP_ID?.trim();
  const keyFile = process.env.GITHUB_APP_KEY_FILE?.trim();
  if (!id || !keyFile || !existsSync(keyFile)) return null;
  return { id, keyFile };
}

export const githubAppConfigured = () => githubAppConfig() !== null;

let cachedKey: { file: string; key: KeyObject } | null = null;
function privateKey(file: string) {
  // GitHub hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"); createPrivateKey reads that and PKCS#8.
  if (cachedKey?.file !== file) cachedKey = { file, key: createPrivateKey(readFileSync(file, "utf8")) };
  return cachedKey.key;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** RS256 JWT that authenticates as the App itself (valid ≤10 min; backdated for clock drift). */
export function appJwt(appId: string, key: KeyObject, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(key);
  return `${header}.${payload}.${b64url(signature)}`;
}

export class GitHubAppError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function gh(path: string, auth: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "unstakd", Authorization: `Bearer ${auth}`, ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GitHubAppError(`GitHub API ${init.method ?? "GET"} ${path}: ${res.status}`, res.status);
  return res.json() as Promise<unknown>;
}

function jwt() {
  const cfg = githubAppConfig();
  if (!cfg) throw new GitHubAppError("GitHub App is not configured");
  return appJwt(cfg.id, privateKey(cfg.keyFile));
}

const tokenRes = z.object({ token: z.string(), expires_at: z.string() });
const tokens = new Map<number, { token: string; expiresAt: number }>();

/** Installation token (1 hour); cached until 5 minutes before it expires. */
export async function installationToken(installationId: number) {
  const hit = tokens.get(installationId);
  if (hit && hit.expiresAt - Date.now() > 5 * 60_000) return hit.token;
  const { token, expires_at } = tokenRes.parse(await gh(`/app/installations/${installationId}/access_tokens`, jwt(), { method: "POST" }));
  tokens.set(installationId, { token, expiresAt: Date.parse(expires_at) });
  return token;
}

const installationRes = z.object({ id: z.number() });

/**
 * A token that can clone `owner/name`, or null when the App isn't configured or isn't installed
 * on that repo (public repos then clone without one).
 */
export async function tokenForRepo(repo: string): Promise<string | null> {
  if (!githubAppConfigured()) return null;
  try {
    const { id } = installationRes.parse(await gh(`/repos/${repo}/installation`, jwt()));
    return await installationToken(id);
  } catch (e) {
    if (e instanceof GitHubAppError && e.status === 404) return null;
    throw e;
  }
}

const appRes = z.object({ slug: z.string(), name: z.string(), html_url: z.string() });
const installationsRes = z.array(
  z.object({
    id: z.number(),
    account: z.object({ login: z.string(), type: z.string() }).nullable(),
    repository_selection: z.enum(["all", "selected"]),
    html_url: z.string(),
  }),
);

export async function appInfo() {
  const token = jwt();
  const [app, installations] = await Promise.all([gh("/app", token).then((r) => appRes.parse(r)), gh("/app/installations?per_page=100", token).then((r) => installationsRes.parse(r))]);
  return {
    ...app,
    installUrl: `https://github.com/apps/${app.slug}/installations/new`,
    installations: installations.map((i) => ({ id: i.id, account: i.account?.login ?? "?", accountType: i.account?.type ?? "User", selection: i.repository_selection, manageUrl: i.html_url })),
  };
}

const reposRes = z.object({
  total_count: z.number(),
  repositories: z.array(z.object({ full_name: z.string(), private: z.boolean(), default_branch: z.string(), pushed_at: z.string().nullable(), archived: z.boolean().optional() })),
});

export type AppRepo = { repo: string; private: boolean; defaultBranch: string; pushedAt: string | null };

/** Every repo the App can see across its installations, most recently pushed first. */
export async function listAppRepos(): Promise<AppRepo[]> {
  const { installations } = await appInfo();
  const all: AppRepo[] = [];
  for (const inst of installations) {
    const token = await installationToken(inst.id);
    for (let page = 1; page <= 10; page++) {
      const r = reposRes.parse(await gh(`/installation/repositories?per_page=100&page=${page}`, token));
      for (const x of r.repositories) if (!x.archived) all.push({ repo: x.full_name, private: x.private, defaultBranch: x.default_branch, pushedAt: x.pushed_at });
      if (page * 100 >= r.total_count) break;
    }
  }
  return sortRepos(all);
}

export function sortRepos(repos: AppRepo[]) {
  return [...repos].sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "") || a.repo.localeCompare(b.repo));
}
