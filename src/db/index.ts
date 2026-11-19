import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { unstakdDb?: DB };

// One pool per process; reused across dev hot reloads.
export function db(): DB {
  globalForDb.unstakdDb ??= drizzle(postgres(env().DATABASE_URL, { max: 10 }), { schema });
  return globalForDb.unstakdDb;
}

export { schema };
