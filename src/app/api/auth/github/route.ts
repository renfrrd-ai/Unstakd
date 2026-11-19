import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest, connection } from "next/server";
import { env } from "@/lib/env";
import { safeNext, STATE_COOKIE } from "@/server/oauth";

export async function GET(request: NextRequest) {
  await connection();
  const { GITHUB_CLIENT_ID, APP_URL } = env();
  if (!GITHUB_CLIENT_ID) return NextResponse.json({ error: "GitHub sign-in is not configured" }, { status: 500 });

  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${APP_URL}/api/auth/callback`);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next: safeNext(request.nextUrl.searchParams.get("next")) }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
