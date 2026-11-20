import { generateKeyPairSync, createVerify } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appJwt, githubAppConfig, sortRepos, tokenForRepo } from "./github-app";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

describe("appJwt", () => {
  it("signs an RS256 token GitHub accepts: backdated iat, under 10 minutes, issued by the App", () => {
    const now = 1_800_000_000;
    const [h, p, sig] = appJwt("12345", privateKey, now).split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(payload).toEqual({ iat: now - 60, exp: now + 540, iss: "12345" });
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });
});

describe("githubAppConfig", () => {
  const saved = { id: process.env.GITHUB_APP_ID, file: process.env.GITHUB_APP_KEY_FILE };
  let dir = "";
  afterEach(async () => {
    process.env.GITHUB_APP_ID = saved.id;
    process.env.GITHUB_APP_KEY_FILE = saved.file;
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("needs both the App ID and an existing key file", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "unstakd-ghapp-"));
    const file = path.join(dir, "app.pem");
    process.env.GITHUB_APP_ID = "1";
    process.env.GITHUB_APP_KEY_FILE = file;
    expect(githubAppConfig()).toBeNull();
    await writeFile(file, privateKey.export({ type: "pkcs1", format: "pem" }));
    expect(githubAppConfig()).toEqual({ id: "1", keyFile: file });
    process.env.GITHUB_APP_ID = "";
    expect(githubAppConfig()).toBeNull();
  });

  it("clones without a token when the App isn't set up", async () => {
    process.env.GITHUB_APP_ID = "";
    expect(await tokenForRepo("owner/name")).toBeNull();
  });
});

describe("sortRepos", () => {
  it("puts the most recently pushed first, never-pushed last", () => {
    const r = (repo: string, pushedAt: string | null) => ({ repo, private: false, defaultBranch: "main", pushedAt });
    expect(sortRepos([r("a/old", "2026-01-01T00:00:00Z"), r("a/none", null), r("a/new", "2026-11-01T00:00:00Z")]).map((x) => x.repo)).toEqual(["a/new", "a/old", "a/none"]);
  });
});
