import { connection } from "next/server";
import { api, deploymentJson, projectBySlug, projectJson, recentDeployments } from "@/server/api-v1";

const show = api(async (_req, ctx: RouteContext<"/api/v1/projects/[slug]">) => {
  const project = await projectBySlug((await ctx.params).slug);
  return { project: projectJson(project), deployments: (await recentDeployments(project.id)).map(deploymentJson) };
});

export async function GET(request: Request, ctx: RouteContext<"/api/v1/projects/[slug]">) {
  await connection();
  return show(request, ctx);
}
