import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { docker, LABEL } from "./docker";

const run = promisify(execFile);

export type StaticPlan = { buildCommand: string | null; outputDir: string };
export type Detected = { mode: "dockerfile" | "railpack" | "static"; framework: string | null; port: number | null; static?: StaticPlan };

const FRAMEWORKS: [string, string][] = [
  ["next", "Next.js"],
  ["nuxt", "Nuxt"],
  ["@remix-run/node", "Remix"],
  ["astro", "Astro"],
  ["@sveltejs/kit", "SvelteKit"],
  ["vite", "Vite"],
  ["@nestjs/core", "NestJS"],
  ["fastify", "Fastify"],
  ["hono", "Hono"],
  ["express", "Express"],
  ["react-scripts", "Create React App"],
  ["gatsby", "Gatsby"],
  ["@docusaurus/core", "Docusaurus"],
  ["vitepress", "VitePress"],
  ["@11ty/eleventy", "Eleventy"],
];

// Generators whose `build` produces plain files, and where they put them.
const STATIC_OUTPUT: [string, string][] = [
  ["vitepress", ".vitepress/dist"],
  ["@docusaurus/core", "build"],
  ["gatsby", "public"],
  ["@11ty/eleventy", "_site"],
  ["react-scripts", "build"],
  ["astro", "dist"],
  ["vite", "dist"],
];
// Any of these means the app needs a running server.
const SERVER_DEPS = ["next", "nuxt", "@remix-run/node", "@react-router/node", "@sveltejs/kit", "express", "fastify", "hono", "@nestjs/core", "koa", "@astrojs/node"];

export function runScript(dir: string) {
  if (existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm run";
  if (existsSync(path.join(dir, "yarn.lock"))) return "yarn";
  return "npm run";
}

// Static when a known generator builds the site and nothing needs a server, or it's plain HTML.
function nextStaticExport(dir: string) {
  for (const name of ["next.config.ts", "next.config.mjs", "next.config.js", "next.config.cjs"]) {
    const file = path.join(/*turbopackIgnore: true*/ dir, name);
    if (existsSync(/*turbopackIgnore: true*/ file)) return /\boutput\s*:\s*["'`]export["'`]/.test(readFileSync(/*turbopackIgnore: true*/ file, "utf8"));
  }
  return false;
}

export function detectStatic(dir: string, pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> } | null): StaticPlan | null {
  if (!pkg) {
    if (existsSync(path.join(dir, "index.html"))) return { buildCommand: null, outputDir: "." };
    if (existsSync(path.join(dir, "public", "index.html"))) return { buildCommand: null, outputDir: "public" };
    return null;
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  // Next.js with `output: "export"` writes plain files to out/.
  if (deps.next && pkg.scripts?.build && nextStaticExport(dir)) return { buildCommand: `${runScript(dir)} build`, outputDir: "out" };
  if (SERVER_DEPS.some((d) => deps[d]) || !pkg.scripts?.build) return null;
  const hit = STATIC_OUTPUT.find(([dep]) => deps[dep]);
  if (!hit) return null;
  let outputDir = hit[1];
  // `vitepress build docs` puts the output under docs/.
  const vp = /vitepress build\s+([\w./-]+)/.exec(pkg.scripts.build);
  if (hit[0] === "vitepress" && vp) outputDir = path.posix.join(vp[1], ".vitepress/dist");
  return { buildCommand: `${runScript(dir)} build`, outputDir };
}

/**
 * Resolves a project path (root directory, Dockerfile) inside a cloned repo. Follows symlinks
 * and refuses anything that lands outside the repo, so a repo can't point the build at host files.
 */
export async function resolveInRepo(repo: string, rel: string | null | undefined, what = "Root directory") {
  const base = await realpath(repo);
  const target = path.resolve(base, rel || ".");
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    throw new Error(`${what} "${rel}" doesn't exist in the repo`);
  }
  if (real !== base && !real.startsWith(base + path.sep)) throw new Error(`${what} "${rel}" points outside the repo`);
  return real;
}

const SKIP_DIRS = new Set(["node_modules", "vendor", "dist", "build", "out", "target", "venv", ".venv", "__pycache__"]);
const APP_MARKERS = ["Dockerfile", "package.json", "requirements.txt", "pyproject.toml", "go.mod", "index.html"];

// Folders (up to two levels deep) that look like an app of their own: monorepo root-directory candidates.
export async function findAppDirs(repo: string, depth = 2): Promise<string[]> {
  const found: string[] = [];
  const walk = async (rel: string, level: number) => {
    if (level > depth) return;
    const entries = await readdir(path.join(repo, rel), { withFileTypes: true }).catch(() => []);
    if (rel && entries.some((e) => e.isFile() && APP_MARKERS.includes(e.name))) found.push(rel);
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name)) await walk(path.posix.join(rel, e.name), level + 1);
    }
  };
  await walk("", 0);
  return found.sort().slice(0, 50);
}

const isDockerfileName = (n: string) => n === "Dockerfile" || /^Dockerfile\.[\w.-]+$/.test(n) || /^[\w.-]+\.Dockerfile$/.test(n);

// Dockerfiles up to two folders below `dir`, relative to it. A monorepo's api/Dockerfile often
// expects the repo root as its build context (it COPYs the lockfile and shared packages).
export async function findDockerfiles(dir: string, depth = 2): Promise<string[]> {
  const found: string[] = [];
  const walk = async (rel: string, level: number) => {
    const entries = await readdir(path.join(dir, rel), { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isFile() && isDockerfileName(e.name)) found.push(path.posix.join(rel, e.name));
      else if (level < depth && e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name)) await walk(path.posix.join(rel, e.name), level + 1);
    }
  };
  await walk("", 0);
  // The root Dockerfile first, then by path.
  return found.sort((a, b) => Number(b === "Dockerfile") - Number(a === "Dockerfile") || a.localeCompare(b)).slice(0, 50);
}

// `dockerfile` is relative to `dir` (the build context).
export async function detect(dir: string, dockerfile = "Dockerfile"): Promise<Detected> {
  const dockerfileAt = path.join(dir, dockerfile);
  const hasDockerfile = existsSync(dockerfileAt) && (await resolveInRepo(dir, dockerfile, "Dockerfile path").then(() => true, () => false));
  let framework: string | null = null;
  let port: number | null = null;
  let pkg = null;
  try {
    pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    const hit = FRAMEWORKS.find(([dep]) => deps[dep]);
    if (hit) framework = `${hit[1]} ${String(deps[hit[0]]).replace(/^[^\d]*/, "").split(".")[0]}`.trim();
    else framework = "Node";
    port = 3000;
  } catch {
    if (existsSync(path.join(dir, "requirements.txt")) || existsSync(path.join(dir, "pyproject.toml"))) framework = "Python";
    else if (existsSync(path.join(dir, "go.mod"))) framework = "Go";
  }
  if (hasDockerfile) {
    const df = await readFile(dockerfileAt, "utf8");
    const expose = /^\s*EXPOSE\s+(\d+)/im.exec(df);
    if (expose) port = Number(expose[1]);
  }
  if (hasDockerfile) return { mode: "dockerfile", framework, port };
  const plan = framework === "Python" || framework === "Go" ? null : detectStatic(dir, pkg);
  if (plan) return { mode: "static", framework: framework === "Node" ? null : (framework ?? "HTML"), port: null, static: plan };
  return { mode: "railpack", framework, port };
}

export async function railpackAvailable() {
  try {
    await run("railpack", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

type Log = (line: string) => void;

// `dir` is the build context; `dockerfile` is relative to it.
export async function buildDockerfile(dir: string, tag: string, log: Log, signal: AbortSignal, dockerfile = "Dockerfile") {
  const tar = spawn("tar", ["-C", dir, "--exclude=./.git", "-c", "."], { signal });
  tar.on("error", () => {});
  const stream = await docker().buildImage(tar.stdout as unknown as NodeJS.ReadableStream, {
    t: tag,
    dockerfile,
    labels: { [`${LABEL}.managed`]: "true", [`${LABEL}.kind`]: "app-image" },
    rm: true,
    forcerm: true,
  });
  signal.addEventListener("abort", () => (stream as unknown as { destroy(): void }).destroy());
  await new Promise<void>((resolve, reject) => {
    docker().modem.followProgress(
      stream,
      (err, output: { error?: string }[]) => {
        const failed = output?.find((o) => o.error);
        if (err || failed) reject(new Error(failed?.error ?? err?.message ?? "build failed"));
        else resolve();
      },
      (e: { stream?: string; status?: string; error?: string }) => {
        if (e.stream) log(e.stream);
        else if (e.error) log(e.error);
      },
    );
  });
}

// `buildEnv` = the project's variables as KEY=value, available during the build (e.g. NEXT_PUBLIC_*).
export async function buildRailpack(dir: string, tag: string, log: Log, signal: AbortSignal, buildEnv: string[] = []) {
  if (!(await railpackAvailable())) {
    throw new Error("Railpack isn't installed on this server. Add a Dockerfile to the repo, or install railpack (the VPS setup script does).");
  }
  await new Promise<void>((resolve, reject) => {
    const args = ["build", dir, "--name", tag, "--progress", "plain", ...buildEnv.flatMap((e) => ["--env", e])];
    const p = spawn("railpack", args, { signal, env: process.env });
    p.stdout.on("data", (b: Buffer) => log(b.toString("utf8")));
    p.stderr.on("data", (b: Buffer) => log(b.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`railpack exited with ${code}`))));
  });
}
