import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { REPO } from "@/lib/validation";
import { detect, findAppDirs, resolveInRepo, type Detected } from "./builder";
import { cloneRepo } from "./git";
import { tokenForRepo } from "./github-app";

const run = promisify(execFile);

// `appDirs`: subfolders that look like apps of their own, offered as the root directory in monorepos.
export type RepoInfo = { repo: string; defaultBranch: string; detected: Detected; rootDir: string | null; appDirs: string[] };

// Accepts "owner/name" or a GitHub URL.
export function parseRepo(input: string): string | null {
  const cleaned = input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  return REPO.test(cleaned) ? cleaned : null;
}

export async function inspectRepo(repo: string, opts: { token?: string; rootDir?: string | null } = {}): Promise<RepoInfo> {
  let token = opts.token;
  token ??= (await tokenForRepo(repo).catch(() => null)) ?? undefined;
  const url = token ? `https://x-access-token:${token}@github.com/${repo}.git` : `https://github.com/${repo}.git`;
  let defaultBranch = "main";
  try {
    const { stdout } = await run("git", ["ls-remote", "--symref", "--", url, "HEAD"], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 20_000 });
    defaultBranch = /ref: refs\/heads\/(\S+)\s+HEAD/.exec(stdout)?.[1] ?? defaultBranch;
  } catch {
    throw new Error(`Couldn't reach github.com/${repo}. Check the name; for a private repo, install the Unstakd GitHub App on it (Server → GitHub App).`);
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "unstakd-inspect-"));
  try {
    const src = path.join(dir, "src");
    await cloneRepo(repo, defaultBranch, src, { token });
    const appDirs = await findAppDirs(src);
    const rootDir = opts.rootDir ?? null;
    return { repo, defaultBranch, detected: await detect(await resolveInRepo(src, rootDir)), rootDir, appDirs };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
