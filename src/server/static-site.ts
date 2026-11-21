import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { PassThrough, type Readable } from "node:stream";
import type { Project } from "@/db/schema";
import { detectStatic } from "./builder";
import { docker, ensureVolume, execIn, LABEL, pullImage, removeContainer, securityOpts } from "./docker";

// Static sites live in one Docker volume that Caddy mounts read-only at the same path.
export const SITES_VOLUME = () => process.env.SITES_VOLUME ?? "unstakd-sites";
export const SITES_ROOT = "/srv/sites";
const BUILD_IMAGE = () => process.env.STATIC_BUILD_IMAGE ?? "node:22-alpine";
const HELPER_IMAGE = "alpine:3.22";

// A deployment's imageTag holds `site:<slug>/<key>/<dir>` for static deploys.
export const SITE_PREFIX = "site:";
export const isSiteRef = (ref: string | null | undefined): ref is string => !!ref?.startsWith(SITE_PREFIX);
export const siteRoot = (ref: string) => path.posix.join(SITES_ROOT, ref.slice(SITE_PREFIX.length));
export const siteKey = (n: number, pr?: number | null) => (pr ? `pr${pr}-${n}` : String(n));

// Rejects anything that could escape the build directory.
export function cleanOutputDir(dir: string) {
  const norm = path.posix.normalize(dir.trim().replace(/^\.?\/+/, "") || ".").replace(/(.)\/+$/, "$1");
  if (norm.startsWith("..") || path.posix.isAbsolute(norm)) throw new Error(`output directory "${dir}" must be inside the repo`);
  return norm;
}

export function installCommand(dir: string) {
  if (!existsSync(path.join(dir, "package.json"))) return null;
  if (existsSync(path.join(dir, "pnpm-lock.yaml"))) return "corepack enable && pnpm install --frozen-lockfile";
  if (existsSync(path.join(dir, "yarn.lock"))) return "corepack enable && yarn install";
  if (existsSync(path.join(dir, "package-lock.json"))) return "npm ci";
  return "npm install";
}

export function staticPlan(project: Pick<Project, "buildCommand" | "outputDir">, dir: string, pkg: Parameters<typeof detectStatic>[1]) {
  const found = detectStatic(dir, pkg);
  return {
    install: installCommand(dir),
    build: project.buildCommand?.trim() || found?.buildCommand || null,
    outputDir: cleanOutputDir(project.outputDir || found?.outputDir || (pkg ? "dist" : ".")),
  };
}

type Log = (line: string) => void;

async function runToEnd(container: import("dockerode").Container, log: Log, signal: AbortSignal) {
  const onAbort = () => container.kill().catch(() => {});
  signal.addEventListener("abort", onAbort);
  try {
    const stream = (await container.attach({ stream: true, stdout: true, stderr: true })) as unknown as Readable;
    const out = new PassThrough();
    out.on("data", (c: Buffer) => log(c.toString("utf8")));
    docker().modem.demuxStream(stream, out, out);
    await container.start();
    const { StatusCode } = (await container.wait()) as { StatusCode: number };
    return StatusCode;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Builds the site in a throwaway Node container (repo code never touches the sites volume),
 * then copies the output directory into SITES_ROOT/<slug>/<key>/. Returns the site ref.
 */
export async function buildStatic(
  src: string,
  // `subdir`: the project's root directory inside the repo (monorepos); the whole repo is copied in.
  opts: { slug: string; key: string; plan: ReturnType<typeof staticPlan>; subdir?: string; env: string[]; cpu: number; memoryMb: number },
  log: Log,
  signal: AbortSignal,
) {
  const { plan } = opts;
  const workDir = path.posix.join("/src", opts.subdir ?? "");
  const name = `build-${opts.slug}-${opts.key}`;
  const script = [plan.install, plan.build].filter(Boolean).join(" && ") || "true";
  if (plan.install) log(`$ ${plan.install}`);
  if (plan.build) log(`$ ${plan.build}`);

  await pullImage(BUILD_IMAGE(), log);
  await removeContainer(name);
  const builder = await docker().createContainer({
    name,
    Image: BUILD_IMAGE(),
    Cmd: ["sh", "-c", script],
    WorkingDir: workDir,
    Env: ["CI=true", ...opts.env],
    Labels: { [`${LABEL}.managed`]: "true", [`${LABEL}.kind`]: "static-build", [`${LABEL}.project`]: opts.slug },
    HostConfig: {
      Memory: Math.max(opts.memoryMb, 1024) * 1024 * 1024,
      NanoCpus: Math.round(Math.max(opts.cpu, 1) * 1e9),
      SecurityOpt: securityOpts(),
      CapDrop: ["NET_RAW", "SYS_ADMIN", "SYS_PTRACE", "MKNOD"],
    },
  });
  try {
    const tar = spawn("tar", ["-C", path.dirname(src), "--exclude=.git", "-c", path.basename(src)], { signal });
    tar.on("error", () => {});
    await builder.putArchive(tar.stdout, { path: "/" });
    const code = await runToEnd(builder, log, signal);
    if (signal.aborted) throw new Error("cancelled");
    if (code !== 0) throw new Error(`build command exited with ${code}`);

    const from = path.posix.join(workDir, plan.outputDir);
    const archive = (await builder.getArchive({ path: from }).catch(() => {
      throw new Error(`output directory "${plan.outputDir}" doesn't exist after the build`);
    })) as unknown as Readable;
    const ref = `${SITE_PREFIX}${opts.slug}/${opts.key}/${path.posix.basename(from)}`;
    await withSites(async (helper) => {
      const dir = path.posix.join(SITES_ROOT, opts.slug, opts.key);
      await execOk(helper, ["sh", "-c", 'rm -rf "$1" && mkdir -p "$1"', "sh", dir]);
      await docker().getContainer(helper).putArchive(archive, { path: dir });
    });
    return ref;
  } finally {
    await removeContainer(name).catch(() => {});
  }
}

async function execOk(container: string, cmd: string[]) {
  const r = await execIn(container, cmd);
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")} failed: ${r.output.trim().slice(0, 200)}`);
  return r.output;
}

// Runs fn with a short-lived container that has the sites volume mounted read-write.
async function withSites<T>(fn: (container: string) => Promise<T>): Promise<T> {
  await ensureVolume(SITES_VOLUME());
  await pullImage(HELPER_IMAGE);
  const name = `unstakd-sites-${Math.random().toString(36).slice(2, 8)}`;
  const c = await docker().createContainer({
    name,
    Image: HELPER_IMAGE,
    Cmd: ["sleep", "300"],
    Labels: { [`${LABEL}.managed`]: "true", [`${LABEL}.kind`]: "sites-helper" },
    HostConfig: { Binds: [`${SITES_VOLUME()}:${SITES_ROOT}`], NetworkMode: "none", SecurityOpt: securityOpts(), AutoRemove: false },
  });
  try {
    await c.start();
    return await fn(name);
  } finally {
    await removeContainer(name).catch(() => {});
  }
}

// Checks the published site has an index.html; returns its size for the log.
export async function checkSite(ref: string) {
  return withSites(async (helper) => {
    const root = siteRoot(ref);
    const r = await execIn(helper, ["sh", "-c", 'test -f "$1/index.html" && du -sh "$1" | cut -f1', "sh", root]);
    if (r.exitCode !== 0) throw new Error("no index.html in the output directory");
    return r.output.trim();
  });
}

export const siteExists = (ref: string) =>
  withSites(async (helper) => (await execIn(helper, ["test", "-d", siteRoot(ref)])).exitCode === 0).catch(() => false);

/** Deletes every site directory of `slug` whose key isn't in `keep` (all of them when keep is empty). */
export async function pruneSites(slug: string, keep: Set<string> = new Set(), match: (key: string) => boolean = () => true) {
  return withSites(async (helper) => {
    const dir = path.posix.join(SITES_ROOT, slug);
    const listing = await execIn(helper, ["sh", "-c", 'ls -1 "$1" 2>/dev/null || true', "sh", dir]);
    const gone = listing.output
      .split("\n")
      .map((l) => l.trim())
      .filter((k) => k && /^[\w-]+$/.test(k) && match(k) && !keep.has(k));
    if (gone.length) await execOk(helper, ["rm", "-rf", ...gone.map((k) => path.posix.join(dir, k))]);
    if (keep.size === 0 && gone.length === listing.output.split("\n").filter(Boolean).length) await execIn(helper, ["rmdir", dir]);
    return gone.length;
  });
}

// Key part of a site ref (`site:<slug>/<key>/<dir>` → key).
export const siteRefKey = (ref: string) => ref.slice(SITE_PREFIX.length).split("/")[1];
