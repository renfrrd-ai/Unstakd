import { connection, type NextRequest } from "next/server";
import { CHANGES_CHANNEL } from "@/lib/changes";
import { createRedis } from "@/lib/redis";
import { getUser } from "@/server/session";

const encoder = new TextEncoder();

// SSE: one `change` event per ping on the changes channel (the client debounces and refreshes).
export async function GET(request: NextRequest) {
  await connection();
  if (!(await getUser())) return new Response("unauthorized", { status: 401 });

  const sub = createRedis();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    sub.disconnect();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };
      request.signal.addEventListener("abort", stop);
      sub.on("message", (_ch, what: string) => send(`event: change\ndata: ${JSON.stringify(what)}\n\n`));
      await sub.subscribe(CHANGES_CHANNEL);
      send("retry: 3000\n\n");
      // Keeps proxies from closing an idle stream.
      heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
    },
    cancel: stop,
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
