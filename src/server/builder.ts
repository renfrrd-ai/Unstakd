import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { docker, LABEL } from "./docker";

const run = promisify(execFile);

export type Detected = { mode: "dockerfile" | "railpack"; framework: string | null; port: number | null };

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
];

export async function detect(dir: string): Promise<Detected> {
  const hasDockerfile = existsSync(path.join(dir, "Dockerfile"));
  let framework: string | null = null;
  let port: number | null = null;
  try {
    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
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
  return { mode: hasDockerfile ? "dockerfile" : "railpack", framework, port };
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

export async function buildRailpack(dir: string, tag: string, log: Log, signal: AbortSignal) {
  if (!(await railpackAvailable())) {
    throw new Error("Railpack isn't installed on this server. Add a Dockerfile to the repo, or install railpack (the VPS setup script does).");
  }
  await new Promise<void>((resolve, reject) => {
    const p = spawn("railpack", ["build", dir, "--name", tag], { signal, env: process.env });
    p.stdout.on("data", (b: Buffer) => log(b.toString("utf8")));
    p.stderr.on("data", (b: Buffer) => log(b.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`railpack exited with ${code}`))));
  });
}
