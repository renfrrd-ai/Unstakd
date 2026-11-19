import { z } from "zod";

export const STATE_COOKIE = "unstakd_oauth_state";

// Only same-origin paths, so `?next=` can't be used as an open redirect.
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

const stateSchema = z.object({ state: z.string(), next: z.string() });

export function parseState(raw: string | undefined) {
  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw ?? ""));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
