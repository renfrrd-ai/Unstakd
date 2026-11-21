import Docker from "dockerode";

const globalForDocker = globalThis as unknown as { unstakdDocker?: Docker };

export function docker(): Docker {
  globalForDocker.unstakdDocker ??= new Docker({ socketPath: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock" });
  return globalForDocker.unstakdDocker;
}

export const NETWORK = () => process.env.DOCKER_NETWORK ?? "unstakd";
export const LABEL = "dev.unstakd";

// Some hosts (seen: Docker 29 + AppArmor on kernel 7.0) refuse every exec under no-new-privileges.
export function securityOpts(): string[] {
  return process.env.DOCKER_NO_NEW_PRIVILEGES === "false" ? [] : ["no-new-privileges:true"];
}

export async function ensureNetwork(name = NETWORK()) {
  const existing = await docker().listNetworks({ filters: { name: [name] } });
  if (existing.some((n) => n.Name === name)) return;
  await docker().createNetwork({ Name: name, Driver: "bridge", Labels: { [`${LABEL}.managed`]: "true" } });
}

export async function ensureVolume(name: string) {
  try {
    await docker().getVolume(name).inspect();
  } catch {
    await docker().createVolume({ Name: name, Labels: { [`${LABEL}.managed`]: "true" } });
  }
}

export async function imageExists(ref: string) {
  try {
    await docker().getImage(ref).inspect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes one project's image tags (`unstakd/<slug>:*`) except those in `keep`. Works by tag, never
 * by image ID: identical builds share an image (two projects from one repo, a redeploy of the same
 * commit), and removing by ID would take the other project's tags, its live image included.
 * Docker deletes the image itself only once its last tag is gone and no container uses it.
 */
export async function removeProjectImages(slug: string, keep: Set<string> = new Set()) {
  const repo = `unstakd/${slug}`;
  const images = await docker().listImages({ filters: { reference: [repo] } });
  let removed = 0;
  for (const tag of images.flatMap((img) => img.RepoTags ?? [])) {
    if (!tag.startsWith(`${repo}:`) || keep.has(tag)) continue;
    try {
      await docker().getImage(tag).remove();
      removed++;
    } catch {
      // Still used by a container (e.g. a stopped previous deploy); retry next run.
    }
  }
  return removed;
}

export async function pullImage(ref: string, onProgress?: (line: string) => void) {
  if (await imageExists(ref)) return;
  const stream = await docker().pull(ref);
  await new Promise<void>((resolve, reject) =>
    docker().modem.followProgress(
      stream,
      (err) => (err ? reject(err) : resolve()),
      (e: { status?: string; id?: string }) => e.status && !e.id && onProgress?.(e.status),
    ),
  );
}

export async function containerState(name: string) {
  try {
    const info = await docker().getContainer(name).inspect();
    return { exists: true, running: info.State.Running, health: info.State.Health?.Status, exitCode: info.State.ExitCode };
  } catch {
    return { exists: false, running: false, health: undefined, exitCode: undefined };
  }
}

export async function removeContainer(name: string) {
  try {
    await docker().getContainer(name).remove({ force: true });
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode !== 404) throw e;
  }
}

export async function stopContainer(name: string, graceSeconds = 10) {
  try {
    await docker().getContainer(name).stop({ t: graceSeconds });
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code !== 304 && code !== 404) throw e;
  }
}

export async function startContainer(name: string) {
  try {
    await docker().getContainer(name).start();
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode !== 304) throw e;
  }
}

// Runs a command (argv, no shell) inside a running container and returns its output.
export async function execIn(name: string, cmd: string[], env: string[] = []): Promise<{ exitCode: number; output: string }> {
  const exec = await docker().getContainer(name).exec({ Cmd: cmd, Env: env, AttachStdout: true, AttachStderr: true });
  const stream = await exec.start({ hijack: true, stdin: false });
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    docker().modem.demuxStream(stream, { write: (c: Buffer) => chunks.push(c) } as never, { write: (c: Buffer) => chunks.push(c) } as never);
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const { ExitCode } = await exec.inspect();
  return { exitCode: ExitCode ?? -1, output: Buffer.concat(chunks).toString("utf8") };
}

export async function waitFor(check: () => Promise<boolean>, { timeoutMs, intervalMs = 1000 }: { timeoutMs: number; intervalMs?: number }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// Streams a command's stdout (and optionally feeds stdin). `done` resolves with the exit code
// and the tail of stderr once the command finishes.
export async function execStream(name: string, cmd: string[], { env = [], stdin }: { env?: string[]; stdin?: NodeJS.ReadableStream } = {}) {
  const { PassThrough } = await import("node:stream");
  const exec = await docker().getContainer(name).exec({ Cmd: cmd, Env: env, AttachStdout: true, AttachStderr: true, AttachStdin: !!stdin });
  const stream = await exec.start({ hijack: true, stdin: !!stdin });
  const stdout = new PassThrough();
  let stderr = "";
  const errSink = new PassThrough();
  errSink.on("data", (c: Buffer) => (stderr = (stderr + c.toString("utf8")).slice(-4000)));
  docker().modem.demuxStream(stream, stdout, errSink);
  if (stdin) {
    stdin.pipe(stream as unknown as NodeJS.WritableStream);
    stdin.on("end", () => (stream as unknown as { end(): void }).end());
  }
  const done = new Promise<{ exitCode: number; stderr: string }>((resolve, reject) => {
    stream.on("end", async () => {
      stdout.end();
      try {
        const info = await exec.inspect();
        resolve({ exitCode: info.ExitCode ?? -1, stderr });
      } catch (e) {
        reject(e);
      }
    });
    stream.on("error", reject);
  });
  return { stdout, done };
}
