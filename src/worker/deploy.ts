import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Deployment, DeployStep, Project } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { defaultHost, previewHost } from "@/lib/domains";
import { env } from "@/lib/env";
import { cancelKey, queues } from "@/lib/queue";
import { createRedis, redis } from "@/lib/redis";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { readLog } from "@/lib/logs";
import { buildDockerfile, buildRailpack, detect } from "@/server/builder";
import { caddyEnabled, previewRouteId, setRoute, type Upstream } from "@/server/caddy";
import { applyRoute, describeUpstream, upstreamFor } from "@/server/routing";
import { buildStatic, checkSite, isSiteRef, siteExists, siteKey, staticPlan } from "@/server/static-site";
import { connectionUrl } from "@/server/db-connection";
import { containerState, docker, ensureNetwork, imageExists, LABEL, NETWORK, removeContainer, securityOpts } from "@/server/docker";
import { cloneRepo } from "@/server/git";
import { DeployLogger } from "./logger";

const HEALTH_TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_SECONDS ?? 60) * 1000;
const GRACE_MS = Number(process.env.SWITCH_GRACE_SECONDS ?? 30) * 1000;

class Cancelled extends Error {}

export const appContainerName = (slug: string, n: number, pr?: number | null) => (pr ? `app-${slug}-pr${pr}-${n}` : `app-${slug}-${n}`);
export const imageTagFor = (slug: string, sha: string, n: number) => `unstakd/${slug}:${sha.slice(0, 12)}-${n}`;

export async function runDeploy(deploymentId: string) {
  const [d] = await db().select().from(s.deployments).where(eq(s.deployments.id, deploymentId));
  if (!d || d.status !== "queued") return;
  const [project] = await db().select().from(s.projects).where(eq(s.projects.id, d.projectId));
  if (!project) return;

  const pub = createRedis();
  const log = new DeployLogger(d.id, pub);
  await log.init();
  const steps: DeployStep[] = (["clone", "build", "push", "start", "health", "switch"] as const).map((name) => ({ name, status: "pending" }));
  const save = (patch: Partial<Deployment> = {}) => db().update(s.deployments).set({ ...patch, steps }).where(eq(s.deployments.id, d.id));
  await save({ status: "building", startedAt: new Date() });

  const abort = new AbortController();
  const cancelPoll = setInterval(async () => {
    if (await redis().get(cancelKey(d.id))) abort.abort();
  }, 2000);

  async function step<T>(name: DeployStep["name"], fn: () => Promise<T>, note?: (r: T) => string | undefined): Promise<T> {
    if (abort.signal.aborted) throw new Cancelled("cancelled");
    const st = steps.find((x) => x.name === name)!;
    const t0 = Date.now();
    st.status = "running";
    st.startedAt = new Date().toISOString();
    await save();
    try {
      const result = await fn();
      st.status = "done";
      st.durationMs = Date.now() - t0;
      st.note = note?.(result);
      await save();
      return result;
    } catch (e) {
      st.status = "failed";
      st.durationMs = Date.now() - t0;
      st.note = abort.signal.aborted ? "cancelled" : name === "health" ? (e as Error).message.slice(0, 60) : "failed";
      await save();
      throw abort.signal.aborted ? new Cancelled("cancelled") : e;
    }
  }
  const skip = async (name: DeployStep["name"], note: string) => {
    const st = steps.find((x) => x.name === name)!;
    st.status = "skipped";
    st.note = note;
    await save();
  };

  // Static mode: build in a throwaway container and publish the output to the sites volume.
  const buildSite = async (src: string) => {
    const ref = await step("build", async () => {
      const pkg = await readFile(path.join(src, "package.json"), "utf8").then(JSON.parse, () => null);
      const plan = staticPlan(project, src, pkg);
      log.step(`build  static site${project.framework ? ` · ${project.framework}` : ""} → ${plan.outputDir}/`);
      const env = await containerEnv(project);
      const site = await buildStatic(src, { slug: project.slug, key: siteKey(d.number, pr), plan, env, cpu: project.cpuLimit, memoryMb: project.memoryMb }, log.info, abort.signal);
      log.info(`published ${site}`);
      return site;
    });
    await skip("push", "static");
    return ref;
  };

  const buildImage = async (src: string, tag: string) => {
    await step("build", async () => {
      const found = await detect(src);
      const mode = found.mode === "dockerfile" || project.buildMode === "dockerfile" ? "dockerfile" : "railpack";
      if (found.framework && found.framework !== project.framework) {
        await db().update(s.projects).set({ framework: found.framework }).where(eq(s.projects.id, project.id));
      }
      log.step(`build  ${mode}${found.framework ? ` · ${found.framework}` : ""}`);
      if (mode === "dockerfile") await buildDockerfile(src, tag, log.info, abort.signal);
      else await buildRailpack(src, tag, log.info, abort.signal, await containerEnv(project));
      log.info(`built ${tag}`);
    });
    await step(
      "push",
      async () => {
        const registry = process.env.REGISTRY;
        if (!registry) {
          log.step("push  kept in the local image store (no registry configured)");
          return "local";
        }
        const remote = `${registry}/${tag.replace(/^unstakd\//, "")}`;
        log.step(`push  ${remote}`);
        const [repo, version] = remote.split(/:(?=[^:]+$)/);
        await docker().getImage(tag).tag({ repo, tag: version });
        const stream = await docker().getImage(remote).push({});
        await new Promise<void>((res, rej) => docker().modem.followProgress(stream, (err) => (err ? rej(err) : res())));
        return "registry";
      },
      (where) => (where === "local" ? "local" : undefined),
    );
    return tag;
  };

  // 4–5: start the new container next to the live one, then wait for it to answer.
  const startApp = async (name: string, image: string): Promise<Upstream> => {
    const ip = await step("start", async () => {
      log.step(`start  ${name} on ${NETWORK()}, port ${project.port}`);
      await waitForLinkedDatabases(project.id, log);
      await ensureNetwork();
      await removeContainer(name);
      const container = await docker().createContainer({
        name,
        Image: image,
        Env: await containerEnv(project),
        Labels: {
          [`${LABEL}.managed`]: "true",
          [`${LABEL}.kind`]: "app",
          [`${LABEL}.project`]: project.slug,
          [`${LABEL}.deployment`]: String(d.number),
          ...(pr ? { [`${LABEL}.preview`]: String(pr) } : {}),
        },
        HostConfig: {
          NetworkMode: NETWORK(),
          RestartPolicy: { Name: "unless-stopped" },
          Memory: project.memoryMb * 1024 * 1024,
          NanoCpus: Math.round(project.cpuLimit * 1e9),
          SecurityOpt: securityOpts(),
          CapDrop: ["NET_RAW", "SYS_ADMIN", "SYS_PTRACE", "MKNOD"],
          LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } },
        },
      });
      await container.start();
      const info = await container.inspect();
      return info.NetworkSettings.Networks[NETWORK()]?.IPAddress;
    });
    if (!ip) throw new Error("container has no address on the app network");
    // Container output goes into the deploy log while we wait.
    const stopTail = await tailContainer(name, log.info);
    try {
      await step("health", () => healthCheck(name, `http://${ip}:${project.port}${project.healthPath}`, log, abort.signal));
    } finally {
      stopTail();
    }
    return { dial: `${name}:${project.port}` };
  };

  const workdir = await mkdtemp(path.join(os.tmpdir(), "unstakd-build-"));
  const pr = d.previewPr;
  let imageTag = d.imageTag;
  // Static sites have no container: their "image" is a directory of files Caddy serves.
  const isStatic = d.rollbackOf ? isSiteRef(imageTag) : project.buildMode === "static";
  const containerName = isStatic ? null : appContainerName(project.slug, d.number, pr);

  try {
    // 1–3: get an image (or site files), either by building or by reusing a previous deploy's (rollback).
    const reusable = !!d.rollbackOf && !!imageTag && (isStatic ? await siteExists(imageTag) : await imageExists(imageTag));
    if (reusable) {
      log.step(`rollback  reusing ${isStatic ? "site files" : "image"} ${imageTag}, no rebuild`);
      await skip("clone", "rollback");
      await skip("build", "rollback");
      await skip("push", "rollback");
    } else {
      const src = path.join(workdir, "src");
      const commit = await step("clone", async () => {
        log.step(`clone  github.com/${project.repo} @ ${pr ? `pull request #${pr}` : project.branch}`);
        const c = await cloneRepo(project.repo, project.branch, src, { sha: d.commitSha, pr, onLine: log.info });
        log.info(`checked out ${c.sha.slice(0, 7)} ${c.message}`);
        return c;
      });
      await save({ commitSha: commit.sha, commitMessage: d.trigger === "manual" || !d.commitMessage ? commit.message : d.commitMessage });
      imageTag = isStatic ? await buildSite(src) : await buildImage(src, imageTagFor(project.slug, commit.sha, d.number));
      await save({ imageTag });
    }
    await save({ status: "deploying", imageTag, containerName });

    let upstream: Upstream;
    if (isStatic) {
      // 4–5: nothing to start; check the published files instead.
      await skip("start", "static");
      await step("health", async () => {
        log.step("health  checking the published files");
        const size = await checkSite(imageTag!);
        log.info(`health  index.html found, ${size} total`);
      });
      upstream = upstreamFor(project, { containerName: null, imageTag })!;
    } else {
      upstream = await startApp(containerName!, imageTag!);
    }

    // 6: point the proxy at the new container, then retire the old one after a grace period.
    // A preview replaces only the previous preview of the same PR; the live deploy is untouched.
    const [previous] = pr
      ? await db()
          .select()
          .from(s.deployments)
          .where(and(eq(s.deployments.projectId, project.id), eq(s.deployments.previewPr, pr), eq(s.deployments.status, "live")))
      : project.liveDeploymentId
        ? await db().select().from(s.deployments).where(eq(s.deployments.id, project.liveDeploymentId))
        : [];
    await step("switch", async () => {
      if (!caddyEnabled()) {
        log.warn(`switch  no proxy configured (CADDY_ADMIN_URL unset); ${isStatic ? "files are published" : "container is running"} but not routed`);
        return;
      }
      if (pr) {
        const host = previewHost(project.slug, pr, env().APPS_DOMAIN);
        await setRoute(project.slug, [host], upstream, null, previewRouteId(project.slug, pr));
        log.step(`switch  preview route → ${describeUpstream(upstream)} for ${host}`);
        return;
      }
      const plan = await applyRoute(project, { containerName, imageTag });
      log.step(`switch  caddy route → ${describeUpstream(plan.upstream)} for ${plan.serve.join(", ")}`);
      if (plan.redirect) log.info(`${plan.redirect.from.join(", ")} redirects to ${plan.redirect.to}`);
    });

    await db().transaction(async (tx) => {
      if (previous) await tx.update(s.deployments).set({ status: "superseded" }).where(eq(s.deployments.id, previous.id));
      await tx.update(s.deployments).set({ status: "live", finishedAt: new Date(), steps }).where(eq(s.deployments.id, d.id));
      if (!pr) await tx.update(s.projects).set({ liveDeploymentId: d.id }).where(eq(s.projects.id, project.id));
    });
    if (previous?.containerName && previous.containerName !== containerName) {
      const grace = pr ? 5_000 : GRACE_MS;
      await queues().ops.add("stop-container", { kind: "stop-container", containerName: previous.containerName }, { delay: grace });
      log.info(`previous container ${previous.containerName} stops in ${grace / 1000}s`);
    }
    if (pr) {
      log.step(`live  preview of PR #${pr} at ${previewHost(project.slug, pr, env().APPS_DOMAIN)}`);
      await audit("preview.live", project.name, { number: d.number, pr });
    } else {
      log.step(`live  #${d.number} is serving ${defaultHost(project.slug, env().APPS_DOMAIN)}`);
      await audit("deploy.live", project.name, { number: d.number, sha: d.commitSha?.slice(0, 7) });
    }
  } catch (e) {
    const cancelled = e instanceof Cancelled || abort.signal.aborted;
    for (const st of steps) if (st.status === "pending") st.status = "skipped";
    log.err(cancelled ? "deploy cancelled" : (e as Error).message);
    log.info(pr ? "the previous preview (if any) keeps serving" : project.liveDeploymentId ? "traffic stays on the previous deploy" : "nothing was live before this deploy");
    if (containerName) await removeContainer(containerName).catch(() => {});
    await save({ status: cancelled ? "cancelled" : "failed", finishedAt: new Date(), error: cancelled ? null : (e as Error).message.slice(0, 500) });
    if (!cancelled) {
      const failedStep = steps.find((x) => x.status === "failed")?.name;
      await audit("deploy.failed", project.name, { number: d.number, step: failedStep });
      await log.flush();
      const tail = (await readLog(d.id)).slice(-40).map((l) => l.text);
      const sent = await notify({
        level: "error",
        title: `✕ ${project.name} ${pr ? `preview for PR #${pr}` : `#${d.number}`} failed${failedStep ? ` at ${failedStep}` : ""}`,
        body: `${(e as Error).message}\n${project.liveDeploymentId ? "The previous deploy is still serving." : "Nothing was live before this deploy."}`,
        url: `${env().APP_URL}/projects/${project.slug}/deployments/${d.number}`,
        logTail: tail,
      });
      if (sent.length) await db().update(s.deployments).set({ notified: `${sent.join(" and ")}, with the last ${tail.length} log lines` }).where(eq(s.deployments.id, d.id));
    }
  } finally {
    clearInterval(cancelPoll);
    await redis().del(cancelKey(d.id));
    await log.end();
    pub.disconnect();
    await rm(workdir, { recursive: true, force: true });
  }
}

async function containerEnv(project: Project) {
  const vars = await db().select().from(s.envVars).where(eq(s.envVars.projectId, project.id));
  const links = await db()
    .select({ envKey: s.databaseLinks.envKey, database: s.databases })
    .from(s.databaseLinks)
    .innerJoin(s.databases, eq(s.databases.id, s.databaseLinks.databaseId))
    .where(eq(s.databaseLinks.projectId, project.id));
  const out = new Map<string, string>([
    ["PORT", String(project.port)],
    ["HOSTNAME", "0.0.0.0"],
  ]);
  for (const v of vars) out.set(v.key, decrypt(v.valueEnc));
  for (const l of links) out.set(l.envKey, connectionUrl(l.database));
  return [...out].map(([k, v]) => `${k}=${v}`);
}


async function healthCheck(containerName: string, url: string, log: DeployLogger, signal: AbortSignal) {
  log.info(`health  GET ${new URL(url).pathname}  waiting…`);
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let last = "";
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Cancelled("cancelled");
    const state = await containerState(containerName);
    if (state.exists && !state.running) throw new Error(`container exited with code ${state.exitCode}`);
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      if (res.status < 400) {
        log.info(`health  ${res.status} after ${Math.round((HEALTH_TIMEOUT_MS - (deadline - Date.now())) / 100) / 10}s`);
        return;
      }
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = (e as Error).name === "TimeoutError" ? "no response" : "connection refused";
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out ${HEALTH_TIMEOUT_MS / 1000}s (${last})`);
}

async function tailContainer(name: string, onLine: (l: string) => void) {
  const stream = (await docker().getContainer(name).logs({ follow: true, stdout: true, stderr: true, since: 0 })) as unknown as NodeJS.ReadableStream & { destroy(): void };
  const { PassThrough } = await import("node:stream");
  const out = new PassThrough();
  out.on("data", (c: Buffer) => onLine(c.toString("utf8")));
  docker().modem.demuxStream(stream, out, out);
  return () => stream.destroy();
}

async function waitForLinkedDatabases(projectId: string, log: DeployLogger) {
  for (let i = 0; i < 90; i++) {
    const pending = await db()
      .select({ name: s.databases.name })
      .from(s.databaseLinks)
      .innerJoin(s.databases, eq(s.databases.id, s.databaseLinks.databaseId))
      .where(and(eq(s.databaseLinks.projectId, projectId), eq(s.databases.status, "provisioning")));
    if (pending.length === 0) return;
    if (i === 0) log.info(`waiting for ${pending.map((p) => p.name).join(", ")} to finish starting`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  log.warn("linked database still not ready; starting the app anyway");
}
