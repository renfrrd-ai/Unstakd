import { connection, NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/env";

// GitHub's "Setup URL": where it sends you after installing the App or changing its repos.
// Signed-in users land on New project, where the newly granted repos are listed.
export async function GET(request: NextRequest) {
  await connection();
  const action = request.nextUrl.searchParams.get("setup_action");
  return NextResponse.redirect(appUrl(action === "request" ? "/server" : "/new", request));
}
