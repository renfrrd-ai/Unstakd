import { PassThrough } from "node:stream";
import { eq } from "drizzle-orm";
import { connection, type NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { slugSchema } from "@/lib/validation";
import { docker } from "@/server/docker";
import { getUser } from "@/server/session";

const encoder = new TextEncoder();

// Live container output: the last 24 hours, then follow. Each SSE message is a LogLine with `at` = epoch ms.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/projects/[slug]/logs">) {
  await connection();
  if (!(await getUser())) return new Response("unauthorized", { status: 401 });
  const slug = slugSchema.safeParse((await ctx.params).slug);
  if (!slug.success) return new Response("not found", { status: 404 });
  const [project] = await db().select().from(s.projects).where(eq(s.projects.slug, slug.data));
  if (!project?.liveDeploymentId) return new Response("no live deploy", { status: 404 });
  const [live] = await db().select().from(s.deployments).where(eq(s.deployments.id, project.liveDeploymentId));
  if (!live?.containerName) return new Response("no container", { status: 404 });

  let raw: NodeJS.ReadableStream & { destroy(): void };
  try {
    raw = (await docker()
      .getContainer(live.containerName)
      .logs({ follow: true, stdout: true, stderr: true, timestamps: true, since: Math.floor(Date.now() / 1000) - 24 * 3600, tail: 2000 })) as unknown as typeof raw;
  } catch {
    return new Response("container not found", { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (s: string) => !closed && controller.enqueue(encoder.encode(s));
      const close = () => {
        if (closed) return;
        closed = true;
        raw.destroy();
        controller.close();
      };
      request.signal.addEventListener("abort", close);
      send("event: reset\ndata: {}\n\n");

      const emit = () => {
        const out = new PassThrough();
        let buf = "";
        out.on("data", (c: Buffer) => {
          buf += c.toString("utf8");
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const m = /^(\S+)\s(.*)$/.exec(line);
            const at = m ? Date.parse(m[1]) : Date.now();
            const text = (m ? m[2] : line).replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
            // Many servers log everything to stderr, so classify by content rather than stream.
            const level = /\b(error|exception|fatal|panic|uncaught)\b/i.test(text) ? "err" : /\bwarn(ing)?\b/i.test(text) ? "warn" : "info";
            if (text.trim()) send(`data: ${JSON.stringify({ at, level, text })}\n\n`);
          }
        });
        return out;
      };
      docker().modem.demuxStream(raw, emit(), emit());
      raw.on("end", () => {
        send("event: end\ndata: {}\n\n");
        close();
      });
      raw.on("error", close);
    },
    cancel() {
      raw.destroy();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
