import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Shallow clone of one branch. `token` (GitHub App installation token) enables private repos.
// `pr` checks out a pull request's head (works for PRs from forks too).
export async function cloneRepo(repo: string, branch: string, dir: string, opts: { token?: string; sha?: string | null; pr?: number | null; onLine?: (l: string) => void } = {}) {
  const url = opts.token ? `https://x-access-token:${opts.token}@github.com/${repo}.git` : `https://github.com/${repo}.git`;
  await new Promise<void>((resolve, reject) => {
    const p = spawn("git", ["clone", "--depth", "1", "--single-branch", "--branch", branch, "--", url, dir], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const forward = (b: Buffer) => opts.onLine?.(b.toString("utf8").replaceAll(opts.token ?? "\u0000", "***"));
    p.stdout.on("data", forward);
    p.stderr.on("data", forward);
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`git clone exited with ${code}`))));
  });
  if (opts.pr) {
    await run("git", ["-C", dir, "fetch", "--depth", "1", "origin", `+refs/pull/${opts.pr}/head`], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    await run("git", ["-C", dir, "checkout", "--detach", "FETCH_HEAD"]);
  }
  if (opts.sha) {
    // Pushes name an exact commit; fetch it if the branch has already moved on.
    const head = (await run("git", ["-C", dir, "rev-parse", "HEAD"])).stdout.trim();
    if (head !== opts.sha) {
      await run("git", ["-C", dir, "fetch", "--depth", "1", "origin", opts.sha]);
      await run("git", ["-C", dir, "checkout", "--detach", opts.sha]);
    }
  }
  const sha = (await run("git", ["-C", dir, "rev-parse", "HEAD"])).stdout.trim();
  const message = (await run("git", ["-C", dir, "log", "-1", "--format=%s"])).stdout.trim();
  return { sha, message };
}
