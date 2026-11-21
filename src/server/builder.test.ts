import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dockerfilePathSchema, rootDirSchema } from "@/lib/validation";
import { detect, findAppDirs, resolveInRepo } from "./builder";

let dir: string;
beforeEach(async () => (dir = await mkdtemp(path.join(os.tmpdir(), "unstakd-builder-"))));
afterEach(() => rm(dir, { recursive: true, force: true }));

// A monorepo like api/ + scanner/ + web/, with no Dockerfile at the root.
async function monorepo() {
  await mkdir(path.join(dir, "api"));
  await writeFile(path.join(dir, "api", "Dockerfile"), "FROM node:22\nEXPOSE 3001\n");
  await writeFile(path.join(dir, "api", "package.json"), JSON.stringify({ dependencies: { express: "5" } }));
  await mkdir(path.join(dir, "scanner"));
  await writeFile(path.join(dir, "scanner", "Dockerfile"), "FROM python:3.12\n");
  await writeFile(path.join(dir, "scanner", "requirements.txt"), "");
  await mkdir(path.join(dir, "web", "node_modules", "x"), { recursive: true });
  await writeFile(path.join(dir, "web", "package.json"), "{}");
  await writeFile(path.join(dir, "web", "node_modules", "x", "package.json"), "{}");
}

describe("monorepo builds", () => {
  it("detects a Dockerfile in the root directory and reads its port", async () => {
    await monorepo();
    expect((await detect(dir)).mode).not.toBe("dockerfile");
    expect(await detect(await resolveInRepo(dir, "api"))).toMatchObject({ mode: "dockerfile", framework: "Express 5", port: 3001 });
    expect((await detect(await resolveInRepo(dir, "scanner"))).mode).toBe("dockerfile");
  });

  it("uses a custom Dockerfile path relative to the root directory", async () => {
    await mkdir(path.join(dir, "docker"));
    await writeFile(path.join(dir, "docker", "api.Dockerfile"), "FROM node:22\nEXPOSE 4000\n");
    expect(await detect(dir, "docker/api.Dockerfile")).toMatchObject({ mode: "dockerfile", port: 4000 });
    expect((await detect(dir, "docker/missing.Dockerfile")).mode).not.toBe("dockerfile");
  });

  it("lists app folders, skipping dependencies", async () => {
    await monorepo();
    expect(await findAppDirs(dir)).toEqual(["api", "scanner", "web"]);
  });

  it("refuses root directories and Dockerfiles outside the repo", async () => {
    await symlink(os.tmpdir(), path.join(dir, "escape"));
    await symlink("/etc/hostname", path.join(dir, "Dockerfile"));
    await expect(resolveInRepo(dir, "escape")).rejects.toThrow(/outside the repo/);
    await expect(resolveInRepo(dir, "nope")).rejects.toThrow(/doesn't exist/);
    expect((await detect(dir)).mode).not.toBe("dockerfile");
    expect(await resolveInRepo(dir, null)).toBe(await resolveInRepo(dir, "."));
  });

  it("validates the paths at the form boundary", () => {
    expect(rootDirSchema.parse("./api/")).toBe("api");
    expect(rootDirSchema.parse(".")).toBeNull();
    expect(rootDirSchema.parse("")).toBeNull();
    expect(rootDirSchema.safeParse("../other").success).toBe(false);
    expect(rootDirSchema.safeParse("/srv").success).toBe(false);
    expect(dockerfilePathSchema.parse("docker/api.Dockerfile")).toBe("docker/api.Dockerfile");
    expect(dockerfilePathSchema.safeParse("a b").success).toBe(false);
  });
});
