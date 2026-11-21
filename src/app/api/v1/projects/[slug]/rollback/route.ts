import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { api, ApiError, deploymentJson, projectBySlug } from "@/server/api-v1";
import { createDeployment } from "@/server/deployments";

const body = z.object({ number: z.number().int().positive().optional() });

// Rolls back to deploy #number, or by default to the last good deploy before the live one.
export const POST = api(async (req, ctx: RouteContext<"/api/v1/projects/[slug]/rollback">) => {
  const project = await projectBySlug((await ctx.params).slug);
  const { number } = body.parse(await req.json().catch(() => ({})));
  // Previews have their own images but never serve the project's domains, so they aren't targets.
  const good = and(inArray(s.deployments.status, ["live", "superseded"]), isNull(s.deployments.previewPr));
  const where = number
    ? and(eq(s.deployments.projectId, project.id), eq(s.deployments.number, number), good)
    : and(eq(s.deployments.projectId, project.id), good, lt(s.deployments.number, project.live?.number ?? Number.MAX_SAFE_INTEGER));
  const [target] = await db().select().from(s.deployments).where(where).orderBy(desc(s.deployments.number)).limit(1);
  if (!target?.imageTag) throw new ApiError(409, number ? `deploy #${number} has no image to roll back to` : "no earlier deploy to roll back to");
  const d = await createDeployment(project, { trigger: "rollback", rollbackOf: target });
  return { deployment: deploymentJson(d), target: target.number };
});
