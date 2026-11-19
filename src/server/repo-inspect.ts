import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { REPO } from "@/lib/validation";
import { detect, type Detected } from "./builder";
import { cloneRepo } from "./git";

const run = promisify(execFile);

export type RepoInfo = { repo: string; defaultBranch: string; detected: Detected };

// Accepts "owner/name" or a GitHub URL.
export function parseRepo(input: string): string | null {
  const cleaned = input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  return REPO.test(cleaned) ? cleaned : null;
}

export async function inspectRepo(repo: string, token?: string): Promise<RepoInfo> {
  const url = token ? `https://x-access-token:${token}@github.com/${repo}.git` : `https://github.com/${repo}.git`;
  let defaultBranch = "main";
  try {
    const { stdout } = await run("git", ["ls-remote", "--symref", "--", url, "HEAD"], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 20_000 });
    defaultBranch = /ref: refs\/heads\/(\S+)\s+HEAD/.exec(stdout)?.[1] ?? defaultBranch;
  } catch {
    throw new Error(`Couldn't reach github.com/${repo}. Check the name; private repos need the Unstakd GitHub App.`);
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "unstakd-inspect-"));
  try {
    await cloneRepo(repo, defaultBranch, path.join(dir, "src"), { token });
    return { repo, defaultBranch, detected: await detect(path.join(dir, "src")) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
