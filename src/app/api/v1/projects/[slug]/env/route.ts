import { and, eq, inArray } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { publishChange } from "@/lib/changes";
import { decrypt } from "@/lib/crypto";
import { envKeySchema } from "@/lib/validation";
import { api, projectBySlug } from "@/server/api-v1";
import { audit } from "@/server/audit";
import { upsertEnv } from "@/server/env-vars";

type Ctx = RouteContext<"/api/v1/projects/[slug]/env">;

// Secret values are never returned, same as the dashboard.
const list = api(async (_req, ctx: Ctx) => {
  const project = await projectBySlug((await ctx.params).slug);
  const rows = await db().select().from(s.envVars).where(eq(s.envVars.projectId, project.id)).orderBy(s.envVars.key);
  return { vars: rows.map((r) => ({ key: r.key, secret: r.secret, value: r.secret ? null : decrypt(r.valueEnc) })) };
});

export async function GET(request: Request, ctx: Ctx) {
  await connection();
  return list(request, ctx);
}

const setBody = z.object({
  vars: z.record(envKeySchema, z.string().max(32_768)).refine((v) => Object.keys(v).length > 0, "no variables given"),
  secret: z.boolean().default(true),
});

export const PUT = api(async (req, ctx: Ctx) => {
  const project = await projectBySlug((await ctx.params).slug);
  const { vars, secret } = setBody.parse(await req.json().catch(() => null));
  await upsertEnv(project.id, Object.entries(vars), secret);
  await audit("env.updated", project.name, { keys: Object.keys(vars).join(", "), via: "cli" });
  return { saved: Object.keys(vars) };
});

const delBody = z.object({ keys: z.array(envKeySchema).min(1) });

export const DELETE = api(async (req, ctx: Ctx) => {
  const project = await projectBySlug((await ctx.params).slug);
  const { keys } = delBody.parse(await req.json().catch(() => null));
  const gone = await db()
    .delete(s.envVars)
    .where(and(eq(s.envVars.projectId, project.id), inArray(s.envVars.key, keys)))
    .returning({ key: s.envVars.key });
  await audit("env.updated", project.name, { keys: `removed ${keys.join(", ")}`, via: "cli" });
  await publishChange("env");
  return { removed: gone.map((g) => g.key) };
});
