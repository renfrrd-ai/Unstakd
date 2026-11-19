import { NextResponse, type NextRequest } from "next/server";
import { devAuthEnabled, sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";

export async function POST(request: NextRequest) {
  if (!devAuthEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.set(SESSION_COOKIE, await sealSession({ login: "dev", name: "Developer", avatarUrl: null }), sessionCookieOptions);
  return res;
}
