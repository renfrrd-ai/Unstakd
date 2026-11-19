import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { outputDirSchema } from "@/lib/validation";
import { detect } from "./builder";
import { upstreamFor } from "./routing";
import { cleanOutputDir, installCommand, siteRoot, staticPlan } from "./static-site";

let dir: string;
beforeEach(async () => (dir = await mkdtemp(path.join(os.tmpdir(), "unstakd-static-"))));
afterEach(() => rm(dir, { recursive: true, force: true }));

const pkg = (deps: Record<string, string>, scripts: Record<string, string> = { build: "vite build" }) =>
  writeFile(path.join(dir, "package.json"), JSON.stringify({ devDependencies: deps, scripts }));

describe("static detection", () => {
  it("treats a Vite app without a server as static", async () => {
    await pkg({ vite: "^7.1.0", react: "^19" });
    await writeFile(path.join(dir, "pnpm-lock.yaml"), "");
    const d = await detect(dir);
    expect(d.mode).toBe("static");
    expect(d.static).toEqual({ buildCommand: "pnpm run build", outputDir: "dist" });
    expect(installCommand(dir)).toContain("pnpm install --frozen-lockfile");
  });

  it("keeps apps with a server framework on Railpack", async () => {
    await pkg({ vite: "^7", express: "^5" });
    expect((await detect(dir)).mode).toBe("railpack");
    await pkg({ "@sveltejs/kit": "^2", vite: "^7" });
    expect((await detect(dir)).mode).toBe("railpack");
  });

  it("needs a build script", async () => {
    await pkg({ vite: "^7" }, { dev: "vite" });
    expect((await detect(dir)).mode).toBe("railpack");
  });

  it("serves plain HTML from the root or public/", async () => {
    await writeFile(path.join(dir, "index.html"), "<h1>hi</h1>");
    expect(await detect(dir)).toMatchObject({ mode: "static", framework: "HTML", static: { buildCommand: null, outputDir: "." } });
    await rm(path.join(dir, "index.html"));
    await mkdir(path.join(dir, "public"));
    await writeFile(path.join(dir, "public", "index.html"), "");
    expect((await detect(dir)).static?.outputDir).toBe("public");
  });

  it("prefers a Dockerfile", async () => {
    await writeFile(path.join(dir, "index.html"), "");
    await writeFile(path.join(dir, "Dockerfile"), "FROM nginx\nEXPOSE 80\n");
    expect((await detect(dir)).mode).toBe("dockerfile");
  });

  it("finds VitePress output under its docs folder", async () => {
    await pkg({ vitepress: "^1" }, { build: "vitepress build docs" });
    expect((await detect(dir)).static?.outputDir).toBe("docs/.vitepress/dist");
  });
});

describe("staticPlan", () => {
  it("uses the project's overrides first", async () => {
    await pkg({ vite: "^7" });
    const plan = staticPlan({ buildCommand: "npm run docs", outputDir: "./site/" }, dir, { devDependencies: { vite: "7" }, scripts: { build: "x" } });
    expect(plan).toEqual({ install: "npm install", build: "npm run docs", outputDir: "site" });
  });
});

describe("output directory", () => {
  it("stays inside the repo", () => {
    expect(cleanOutputDir("./dist/")).toBe("dist");
    expect(cleanOutputDir("")).toBe(".");
    expect(() => cleanOutputDir("../etc")).toThrow();
    expect(outputDirSchema.safeParse("a/../../b").success).toBe(false);
    expect(outputDirSchema.safeParse("/abs").success).toBe(false);
    expect(outputDirSchema.parse("./build/")).toBe("build");
    expect(outputDirSchema.parse("")).toBeNull();
  });
});

describe("upstreamFor", () => {
  it("serves files for static deploys and proxies containers otherwise", () => {
    expect(upstreamFor({ port: 3000 }, { containerName: null, imageTag: "site:docs/4/dist" })).toEqual({ root: "/srv/sites/docs/4/dist" });
    expect(upstreamFor({ port: 3000 }, { containerName: "app-x-2", imageTag: "unstakd/x:abc-2" })).toEqual({ dial: "app-x-2:3000" });
    expect(upstreamFor({ port: 3000 }, { containerName: null, imageTag: null })).toBeNull();
    expect(siteRoot("site:a/pr3-9/out")).toBe("/srv/sites/a/pr3-9/out");
  });
});

describe("reserved names", () => {
  it("keeps platform subdomains out of app names", async () => {
    const { newSlugSchema } = await import("@/lib/validation");
    expect(newSlugSchema.safeParse("dash").success).toBe(false);
    expect(newSlugSchema.safeParse("Edge").success).toBe(false);
    for (const n of ["www", "app", "mail", "smtp", "api", "pr-12-blog"]) expect(newSlugSchema.safeParse(n).success).toBe(false);
    expect(newSlugSchema.safeParse("blog").success).toBe(true);
    expect(newSlugSchema.safeParse("pr-blog").success).toBe(true);
  });
});
