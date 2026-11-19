import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
export function detectStatic(dir: string, pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> } | null): StaticPlan | null {
  if (!pkg) {
    if (existsSync(path.join(dir, "index.html"))) return { buildCommand: null, outputDir: "." };
    if (existsSync(path.join(dir, "public", "index.html"))) return { buildCommand: null, outputDir: "public" };
    return null;
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (SERVER_DEPS.some((d) => deps[d]) || !pkg.scripts?.build) return null;
  const hit = STATIC_OUTPUT.find(([dep]) => deps[dep]);
  if (!hit) return null;
  let outputDir = hit[1];
  // `vitepress build docs` puts the output under docs/.
  const vp = /vitepress build\s+([\w./-]+)/.exec(pkg.scripts.build);
  if (hit[0] === "vitepress" && vp) outputDir = path.posix.join(vp[1], ".vitepress/dist");
  return { buildCommand: `${runScript(dir)} build`, outputDir };
}

export async function detect(dir: string): Promise<Detected> {
  const hasDockerfile = existsSync(path.join(dir, "Dockerfile"));
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
    const df = await readFile(path.join(dir, "Dockerfile"), "utf8");
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

export async function buildDockerfile(dir: string, tag: string, log: Log, signal: AbortSignal) {
  const tar = spawn("tar", ["-C", dir, "--exclude=./.git", "-c", "."], { signal });
  tar.on("error", () => {});
  const stream = await docker().buildImage(tar.stdout as unknown as NodeJS.ReadableStream, {
    t: tag,
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
