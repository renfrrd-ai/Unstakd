import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  UNSTAKD_KEY_FILE: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APPS_DOMAIN: z.string().min(1).default("localhost"),
  EDGE_HOST: z.string().default("edge.unstakd.com"),
  EDGE_IP: z.string().default(""),
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
  ALLOWED_GITHUB_LOGINS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean)),
  SESSION_SECRET: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Parsed on first use so builds and tooling don't need every variable set.
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
