import { connection } from "next/server";
import { db, schema as s } from "@/db";
import { api, projectJson } from "@/server/api-v1";
import { summarize } from "@/server/queries";

const list = api(async () => {
  const rows = await db().select().from(s.projects).orderBy(s.projects.name);
  return { projects: (await summarize(rows)).map(projectJson) };
});

export async function GET(request: Request, ctx: RouteContext<"/api/v1/projects">) {
  await connection();
  return list(request, ctx);
}
