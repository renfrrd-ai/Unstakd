import "server-only";
import type { Database } from "@/db/schema";
import { decrypt } from "@/lib/crypto";

export type DbCredentials = { user?: string; password: string; database?: string };

// Apps reach databases by container name on the private Docker network.
export function connectionUrl(db: Pick<Database, "engine" | "containerName" | "credentialsEnc">, { mask = false } = {}) {
  const c = JSON.parse(decrypt(db.credentialsEnc)) as DbCredentials;
  const pw = mask ? "••••••••" : encodeURIComponent(c.password);
  if (db.engine === "redis") return `redis://:${pw}@${db.containerName}:6379`;
  return `postgres://${encodeURIComponent(c.user ?? "app")}:${pw}@${db.containerName}:5432/${encodeURIComponent(c.database ?? "app")}`;
}
