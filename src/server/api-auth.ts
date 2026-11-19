import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

const PREFIX = "unst_";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createApiToken(name: string) {
  const token = `${PREFIX}${randomBytes(24).toString("base64url")}`;
  const [row] = await db()
    .insert(s.apiTokens)
    .values({ name, tokenHash: hashToken(token), prefix: token.slice(0, PREFIX.length + 6) })
    .returning();
  return { token, row };
}

// Bearer auth for /api/v1. Returns the token row or null; records when it was last used.
export async function apiAuth(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(unst_[\w-]{20,})$/.exec(header);
  if (!m) return null;
  const [row] = await db().select().from(s.apiTokens).where(eq(s.apiTokens.tokenHash, hashToken(m[1])));
  if (!row) return null;
  await db().update(s.apiTokens).set({ lastUsedAt: new Date() }).where(eq(s.apiTokens.id, row.id));
  return row;
}

export const unauthorized = () => Response.json({ error: "invalid or missing API token" }, { status: 401 });
