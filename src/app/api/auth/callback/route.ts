import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest, connection } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { parseState, safeNext, STATE_COOKIE } from "@/server/oauth";
import { isAllowed, sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";

const token = z.object({ access_token: z.string() });
const ghUser = z.object({ login: z.string(), name: z.string().nullable(), avatar_url: z.string().nullable() });

function fail(request: NextRequest, reason: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
  return res;
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: NextRequest) {
  await connection();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const saved = parseState(request.cookies.get(STATE_COOKIE)?.value);
  if (!code || !state || !saved || !same(state, saved.state)) return fail(request, "state");

  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL } = env();
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code, redirect_uri: `${APP_URL}/api/auth/callback` }),
  });
  const parsedToken = token.safeParse(await tokenRes.json());
  if (!parsedToken.success) return fail(request, "github");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${parsedToken.data.access_token}`, Accept: "application/vnd.github+json" },
  });
  const user = ghUser.safeParse(await userRes.json());
  if (!user.success) return fail(request, "github");
  if (!isAllowed(user.data.login)) return fail(request, "not_allowed");

  const res = NextResponse.redirect(new URL(safeNext(saved.next), request.url));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
  res.cookies.set(
    SESSION_COOKIE,
    await sealSession({ login: user.data.login, name: user.data.name ?? user.data.login, avatarUrl: user.data.avatar_url }),
    sessionCookieOptions,
  );
  return res;
}
