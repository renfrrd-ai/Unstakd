import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/server/session";

// Webhooks verify their own signatures; internal endpoints are only reachable from Caddy/localhost.
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/webhooks\//, /^\/api\/internal\//];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  const user = await readSession(request.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
