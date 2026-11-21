import { redis } from "./redis";

// "Something the dashboard shows has changed" — pinged by the worker (job progress) and by the web side
// (deploys created from webhooks/CLI). Open pages listen via /api/events and re-render their server data.
export const CHANGES_CHANNEL = "unstakd:changes";

export async function publishChange(what: string) {
  await redis()
    .publish(CHANGES_CHANNEL, what)
    .catch(() => {});
}
