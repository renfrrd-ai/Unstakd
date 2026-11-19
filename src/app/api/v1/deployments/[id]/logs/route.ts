import { connection } from "next/server";
import { readLog } from "@/lib/logs";
import { isInProgress } from "@/lib/status";
import { api, deploymentById } from "@/server/api-v1";

// Polling-friendly: ?after=N returns lines N.. and whether the deploy has finished.
const logs = api(async (req, ctx: RouteContext<"/api/v1/deployments/[id]/logs">) => {
  const deployment = await deploymentById((await ctx.params).id);
  const after = Math.max(0, Number(new URL(req.url).searchParams.get("after")) || 0);
  const lines = await readLog(deployment.id);
  return { lines: lines.slice(after), next: lines.length, done: !isInProgress(deployment), status: deployment.status };
});

export async function GET(request: Request, ctx: RouteContext<"/api/v1/deployments/[id]/logs">) {
  await connection();
  return logs(request, ctx);
}
