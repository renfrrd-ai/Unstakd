import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { LogMessage } from "@/lib/log-format";
import { logChannel, readLog } from "@/lib/logs";
import { createRedis } from "@/lib/redis";
import { isInProgress } from "@/lib/status";
import { getUser } from "@/server/session";

const encoder = new TextEncoder();

export async function GET(request: NextRequest, ctx: RouteContext<"/api/deployments/[id]/logs">) {
  if (!(await getUser())) return new Response("unauthorized", { status: 401 });
  const parsed = z.string().uuid().safeParse((await ctx.params).id);
  if (!parsed.success) return new Response("not found", { status: 404 });
  const id = parsed.data;

  const [deployment] = await db().select({ status: s.deployments.status }).from(s.deployments).where(eq(s.deployments.id, id));
  if (!deployment) return new Response("not found", { status: 404 });

  const sub = createRedis();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => !closed && controller.enqueue(encoder.encode(chunk));
      const close = () => {
        if (closed) return;
        send("event: end\ndata: {}\n\n");
        closed = true;
        controller.close();
        sub.disconnect();
      };
      request.signal.addEventListener("abort", () => {
        closed = true;
        sub.disconnect();
      });

      // Subscribe before reading the file so nothing written in between is lost.
      const pending: LogMessage[] = [];
      let sent = -1;
      sub.on("message", (_ch, raw) => {
        const msg = JSON.parse(raw) as LogMessage;
        if (sent < 0) return void pending.push(msg);
        forward(msg);
      });
      const forward = (msg: LogMessage) => {
        if ("end" in msg) return close();
        if (msg.seq < sent) return;
        sent = msg.seq + 1;
        send(`data: ${JSON.stringify({ at: msg.at, level: msg.level, text: msg.text })}\n\n`);
      };
      await sub.subscribe(logChannel(id));

      send("event: reset\ndata: {}\n\n");
      const lines = await readLog(id);
      for (const l of lines) send(`data: ${JSON.stringify(l)}\n\n`);
      sent = lines.length;
      pending.forEach(forward);

      // Re-check: the deploy may have finished (and published its end) before we subscribed.
      const [now] = await db().select({ status: s.deployments.status }).from(s.deployments).where(eq(s.deployments.id, id));
      if (!now || !isInProgress(now)) close();
    },
    cancel() {
      closed = true;
      sub.disconnect();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
