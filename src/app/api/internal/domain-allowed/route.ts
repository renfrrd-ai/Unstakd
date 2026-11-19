import { and, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { normalizeHostname } from "@/lib/dns";
import { env } from "@/lib/env";

// Caddy's on-demand TLS "ask" hook: a certificate is only issued for hosts we actually serve,
// so stray domains pointed at the server can't burn Let's Encrypt rate limits.
export async function GET(request: NextRequest) {
  const host = normalizeHostname(request.nextUrl.searchParams.get("domain") ?? "");
  if (!host) return new Response(null, { status: 400 });

  const apps = env().APPS_DOMAIN;
  if (host.endsWith(`.${apps}`)) {
    const slug = host.slice(0, -(apps.length + 1));
    const [p] = await db().select({ id: s.projects.id }).from(s.projects).where(eq(s.projects.slug, slug));
    return new Response(null, { status: p ? 200 : 404 });
  }
  const [d] = await db()
    .select({ id: s.domains.id })
    .from(s.domains)
    .where(and(eq(s.domains.hostname, host), inArray(s.domains.status, ["verified", "active"])));
  return new Response(null, { status: d ? 200 : 404 });
}
