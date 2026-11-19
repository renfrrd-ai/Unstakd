import { connection } from "next/server";
import { api, deploymentById, deploymentJson } from "@/server/api-v1";

const show = api(async (_req, ctx: RouteContext<"/api/v1/deployments/[id]">) => ({
  deployment: deploymentJson(await deploymentById((await ctx.params).id)),
}));

export async function GET(request: Request, ctx: RouteContext<"/api/v1/deployments/[id]">) {
  await connection();
  return show(request, ctx);
}
