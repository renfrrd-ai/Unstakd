import "server-only";
import { sealData, unsealData } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "unstakd_session";
export const SESSION_TTL = 60 * 60 * 24 * 7;

export type User = { login: string; name: string; avatarUrl: string | null };

function password() {
  const secret = env().SESSION_SECRET;
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return secret;
}

// Local sign-in without a GitHub OAuth app, only for `next dev` with no client id set.
export function devAuthEnabled() {
  return process.env.NODE_ENV === "development" && !env().GITHUB_CLIENT_ID;
}

export function isAllowed(login: string) {
  if (devAuthEnabled() && login === "dev") return true;
  return env().ALLOWED_GITHUB_LOGINS.includes(login.toLowerCase());
}

export function sealSession(user: User) {
  return sealData(user, { password: password(), ttl: SESSION_TTL });
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL,
};

// Re-checks the allowlist on every read so removing a login revokes access immediately.
export async function readSession(seal: string | undefined): Promise<User | null> {
  if (!seal) return null;
  const user = await unsealData<Partial<User>>(seal, { password: password(), ttl: SESSION_TTL });
  if (!user.login || !isAllowed(user.login)) return null;
  return { login: user.login, name: user.name ?? user.login, avatarUrl: user.avatarUrl ?? null };
}

export async function getUser(): Promise<User | null> {
  const seal = (await cookies()).get(SESSION_COOKIE)?.value;
  // Unsealing checks the TTL against the clock, which must happen at request time.
  await connection();
  return readSession(seal);
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
