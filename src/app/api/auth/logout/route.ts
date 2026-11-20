import { appUrl } from "@/lib/env";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

export function POST(request: NextRequest) {
  const res = NextResponse.redirect(appUrl("/login", request), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
