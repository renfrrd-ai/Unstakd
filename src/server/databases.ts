import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Database } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { ENGINES, imageFor } from "./database-catalog";
import type { DbCredentials } from "./db-connection";
import { containerState, docker, ensureNetwork, ensureVolume, execIn, LABEL, NETWORK, pullImage, removeContainer, securityOpts, waitFor } from "./docker";

// Postgres 18 images keep data in a versioned dir under /var/lib/postgresql; older ones declare
// /var/lib/postgresql/data as a VOLUME, so mounting the parent would leave data in an anonymous volume.
function dataMount(d: Pick<Database, "engine" | "version">) {
  if (d.engine === "redis") return "/data";
  return Number(d.version) >= 18 ? "/var/lib/postgresql" : "/var/lib/postgresql/data";
}

async function ready(d: Database, creds: DbCredentials) {
  if (d.engine === "postgres") {
    const r = await execIn(d.containerName, ["pg_isready", "-U", creds.user ?? "app", "-d", creds.database ?? "app"]);
    return r.exitCode === 0;
  }
  const r = await execIn(d.containerName, ["redis-cli", "ping"], [`REDISCLI_AUTH=${creds.password}`]);
  return r.output.includes("PONG");
}

export async function provisionDatabase(d: Database, log: (line: string) => void = () => {}) {
  const creds = JSON.parse(decrypt(d.credentialsEnc)) as DbCredentials;
  const image = imageFor(d);
  const engine = ENGINES[d.engine];

  await ensureNetwork();
  await ensureVolume(d.volumeName);
  log(`pulling ${image}`);
  await pullImage(image, log);

  let state = await containerState(d.containerName);
  // A retry rebuilds the container from scratch; the data volume is kept.
  if (state.exists && d.status !== "running") {
    await removeContainer(d.containerName);
    state = await containerState(d.containerName);
  }
  if (!state.exists) {
    log(`starting ${d.containerName}`);
    const container = await docker().createContainer({
      name: d.containerName,
      Image: image,
      Env: d.engine === "postgres" ? [`POSTGRES_USER=${creds.user}`, `POSTGRES_PASSWORD=${creds.password}`, `POSTGRES_DB=${creds.database}`] : [],
      Cmd: d.engine === "redis" ? ["redis-server", "--requirepass", creds.password, "--appendonly", "yes"] : undefined,
      Labels: { [`${LABEL}.managed`]: "true", [`${LABEL}.kind`]: "database", [`${LABEL}.database`]: d.name },
      HostConfig: {
        NetworkMode: NETWORK(),
        RestartPolicy: { Name: "unless-stopped" },
        Mounts: [{ Type: "volume", Source: d.volumeName, Target: dataMount(d) }],
        Memory: engine.memoryMb * 1024 * 1024,
        SecurityOpt: securityOpts(),
      },
      NetworkingConfig: { EndpointsConfig: { [NETWORK()]: { Aliases: [d.containerName] } } },
    });
    await container.start();
  } else if (!state.running) {
    await docker().getContainer(d.containerName).start();
  }

  const ok = await waitFor(() => ready(d, creds), { timeoutMs: 60_000 });
  await db().update(s.databases).set({ status: ok ? "running" : "failed" }).where(eq(s.databases.id, d.id));
  log(ok ? `${d.name} is ready` : `${d.name} did not become ready in 60s`);
  if (ok) await recordUsage(d);
  return ok;
}

export async function destroyDatabase(containerName: string, volumeName: string, { keepVolume = false } = {}) {
  await removeContainer(containerName);
  if (!keepVolume) {
    try {
      await docker().getVolume(volumeName).remove();
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode !== 404) throw e;
    }
  }
}

export async function measureUsage(d: Database): Promise<number | null> {
  const creds = JSON.parse(decrypt(d.credentialsEnc)) as DbCredentials;
  if (d.engine === "postgres") {
    const r = await execIn(d.containerName, ["psql", "-U", creds.user ?? "app", "-d", creds.database ?? "app", "-tAc", "select sum(pg_database_size(datname)) from pg_database"], [`PGPASSWORD=${creds.password}`]);
    const n = Number(r.output.trim());
    return r.exitCode === 0 && Number.isFinite(n) ? n : null;
  }
  const r = await execIn(d.containerName, ["redis-cli", "info", "memory"], [`REDISCLI_AUTH=${creds.password}`]);
  const m = /used_memory:(\d+)/.exec(r.output);
  return m ? Number(m[1]) : null;
}

export async function recordUsage(d: Database) {
  const usage = await measureUsage(d).catch(() => null);
  if (usage != null) await db().update(s.databases).set({ usageBytes: usage, usageCheckedAt: new Date() }).where(eq(s.databases.id, d.id));
}
