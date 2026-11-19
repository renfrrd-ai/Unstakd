import { api, deploymentJson, projectBySlug } from "@/server/api-v1";
import { audit } from "@/server/audit";
import { createDeployment } from "@/server/deployments";

export const POST = api(async (_req, ctx: RouteContext<"/api/v1/projects/[slug]/deploy">) => {
  const project = await projectBySlug((await ctx.params).slug);
  const d = await createDeployment(project, { trigger: "manual", commitSha: null, commitMessage: "deploy from CLI" });
  await audit("deploy.cli", project.name, { number: d.number });
  return { deployment: deploymentJson(d) };
});
