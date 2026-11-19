import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { appendLog, type LogLine } from "@/lib/logs";
import { db, schema } from "./index";
import type { DeployStep } from "./schema";

const s = schema;
const ago = (min: number) => new Date(Date.now() - min * 60_000);

const okSteps = (secs: number[]): DeployStep[] =>
  (["clone", "build", "push", "start", "health", "switch"] as const).map((name, i) => ({
    name,
    status: "done",
    durationMs: (secs[i] ?? 1) * 1000,
  }));

type Seed = {
  name: string;
  host?: string;
  state?: "active" | "standby";
  framework: string;
  deploys: { msg: string; minAgo: number; status: "live" | "failed" | "building" | "superseded" }[];
};

const seeds: Seed[] = [
  {
    name: "twoday",
    host: "ourtwoday.com",
    framework: "Next.js 15",
    deploys: [
      { msg: "mashup frame picker", minAgo: 5760, status: "superseded" },
      { msg: "notes on photos", minAgo: 2880, status: "live" },
      { msg: "collections: drag to reorder", minAgo: 1, status: "building" },
    ],
  },
  {
    name: "clueline",
    host: "clueline.dev",
    framework: "Next.js 15",
    deploys: [
      { msg: "daily puzzle archive", minAgo: 1440, status: "live" },
      { msg: "bump prisma", minAgo: 120, status: "failed" },
    ],
  },
  { name: "portfolio", host: "renfred.dev", framework: "Next.js 15", deploys: [{ msg: "add /proofs induction visual", minAgo: 12, status: "live" }] },
  { name: "trueluk-api", framework: "Node 22", deploys: [{ msg: "risk score v2 endpoint", minAgo: 4320, status: "live" }] },
  { name: "nn-visualizer", state: "standby", framework: "Vite", deploys: [{ msg: "pooling step animation", minAgo: 10080, status: "live" }] },
];

function sampleLog(failed: boolean): LogLine[] {
  const ok: [number, LogLine["level"], string][] = [
    [0, "step", "clone  github.com/renfred/app @ main"],
    [700, "info", "cloned in 0.7s"],
    [800, "step", "build  railpack"],
    [1900, "info", "detected Next.js 15 · Node 22 · pnpm"],
    [34000, "info", "pnpm install --frozen-lockfile  (cached)"],
    [72000, "info", "▲ Next.js 15 · compiled successfully"],
    [74000, "step", "push  registry.local/app"],
    [78000, "step", "start  container on app-net, port 3000"],
    [80000, "info", "health  GET /api/health  waiting…"],
  ];
  const tail: [number, LogLine["level"], string][] = failed
    ? [
        [80900, "warn", "prisma:warn query engine library not found for linux-musl-openssl-3.0.x"],
        [81200, "err", "Error: PrismaClientInitializationError"],
        [110000, "err", "health  no response in 30s · giving up"],
        [110100, "info", "stopped new container · traffic stays on the previous deploy"],
      ]
    : [
        [81200, "info", "health  200 OK in 1.2s"],
        [81300, "step", "switch  caddy route → new container"],
        [111400, "info", "stopped previous container after 30s grace"],
      ];
  return [...ok, ...tail].map(([at, level, text]) => ({ at, level, text }));
}

async function main() {
  const d = db();
  await d.transaction(async (tx) => {
    for (const t of [s.auditEvents, s.backups, s.databaseLinks, s.databases, s.domains, s.envVars, s.deployments, s.projects]) {
      await tx.delete(t);
    }

    for (const seed of seeds) {
      const [project] = await tx
        .insert(s.projects)
        .values({ name: seed.name, slug: seed.name, repo: `renfred/${seed.name}`, framework: seed.framework, healthPath: "/api/health", state: seed.state ?? "active" })
        .returning();

      let live: string | undefined;
      for (const [i, dep] of seed.deploys.entries()) {
        const sha = Math.random().toString(16).slice(2, 9);
        const [row] = await tx
          .insert(s.deployments)
          .values({
            projectId: project.id,
            number: i + 1,
            trigger: i === 0 ? "create" : "push",
            status: dep.status,
            branch: "main",
            commitSha: sha,
            commitMessage: dep.msg,
            imageTag: dep.status === "building" ? null : `${seed.name}:${sha}`,
            steps:
              dep.status === "failed"
                ? [...okSteps([1, 72, 4, 2]).slice(0, 4), { name: "health", status: "failed", durationMs: 30_000, note: "timed out 30s" }, { name: "switch", status: "skipped" }]
                : dep.status === "building"
                  ? [{ name: "clone", status: "done", durationMs: 700 }, { name: "build", status: "running", startedAt: ago(1).toISOString() }]
                  : okSteps([1, 48, 4, 2, 3, 1]),
            error: dep.status === "failed" ? "Health check GET /api/health: no response in 30s" : null,
            createdAt: ago(dep.minAgo),
            startedAt: ago(dep.minAgo),
            finishedAt: dep.status === "building" ? null : ago(dep.minAgo - 1),
          })
          .returning();
        if (dep.status === "live") live = row.id;
        if (dep.status !== "building") await appendLog(row.id, sampleLog(dep.status === "failed"));
      }
      await tx.update(s.projects).set({ liveDeploymentId: live }).where(eq(s.projects.id, project.id));

      await tx.insert(s.domains).values({ projectId: project.id, hostname: `${seed.name}.${env().APPS_DOMAIN}`, status: "active", verifiedAt: ago(9000), isPrimary: !seed.host });
      if (seed.host) {
        await tx.insert(s.domains).values({ projectId: project.id, hostname: seed.host, status: "active", isPrimary: true, verifiedAt: ago(8000) });
      }

      await tx.insert(s.envVars).values([
        { projectId: project.id, key: "NODE_ENV", valueEnc: encrypt("production"), secret: false },
        { projectId: project.id, key: "API_SECRET", valueEnc: encrypt("dev-secret-value"), secret: true },
      ]);
    }

    const twoday = await tx.query.projects.findFirst({ where: (p, { eq }) => eq(p.slug, "twoday") });
    await tx.insert(s.domains).values({ projectId: twoday!.id, hostname: "www.ourtwoday.com", status: "pending", lastCheckedAt: ago(1) });

    const [pg] = await tx
      .insert(s.databases)
      .values({ name: "twoday-pg", engine: "postgres", version: "18", status: "stopped", containerName: "db-twoday-pg", volumeName: "db-twoday-pg", credentialsEnc: encrypt(JSON.stringify({ user: "app", password: "dev", database: "app" })) })
      .returning();
    await tx.insert(s.databaseLinks).values({ databaseId: pg.id, projectId: twoday!.id, envKey: "DATABASE_URL" });
    await tx.insert(s.backups).values({ databaseId: pg.id, objectKey: "backups/twoday-pg/latest.sql.gz", sizeBytes: 4_200_000, status: "done", createdAt: ago(600) });

    await tx.insert(s.auditEvents).values([
      { action: "backup.completed", target: "3 databases", details: { destination: "R2" }, createdAt: ago(600) },
      { action: "domain.certificate", target: "ourtwoday.com", details: { issuer: "Let's Encrypt" }, createdAt: ago(1500) },
      { action: "project.standby", target: "nn-visualizer", details: { freedMb: 180 }, createdAt: ago(2900) },
    ]);
  });
  console.log("Seeded sample data.");
  process.exit(0);
}

await main();
