"use server";

import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { normalizeHostname } from "@/lib/dns";
import { customDomainError, defaultHost } from "@/lib/domains";
import { env } from "@/lib/env";
import { queues } from "@/lib/queue";
import type { FormState } from "@/lib/validation";
import { audit } from "@/server/audit";
import { done, projectFor } from "@/server/project-action";

export async function addDomain(slug: string, _prev: FormState, data: FormData): Promise<FormState> {
  const project = await projectFor(slug);
  const hostname = normalizeHostname(String(data.get("hostname") ?? ""));
  if (!hostname) return { error: "Enter a hostname like photos.example.com" };
  const invalid = customDomainError(hostname, env().APPS_DOMAIN);
  if (invalid) return { error: invalid };

  const [existing] = await db().select({ id: s.domains.id }).from(s.domains).where(eq(s.domains.hostname, hostname));
  if (existing) return { error: `${hostname} is already added to a project` };

  await db().insert(s.domains).values({ projectId: project.id, hostname });
  await queues().ops.add("domain-check", { kind: "domain-check" });
  await audit("domain.added", hostname, { project: project.name });
  return done(`Added ${hostname}. Create the DNS record below; it's checked every minute.`);
}

export async function makePrimary(slug: string, domainId: string) {
  const project = await projectFor(slug);
  await db().transaction(async (tx) => {
    await tx.update(s.domains).set({ isPrimary: false }).where(eq(s.domains.projectId, project.id));
    await tx.update(s.domains).set({ isPrimary: true }).where(and(eq(s.domains.id, domainId), eq(s.domains.projectId, project.id)));
  });
  await queues().ops.add("domain-sync", { kind: "domain-sync", projectId: project.id });
  done("primary changed");
}

export async function removeDomain(slug: string, domainId: string) {
  const project = await projectFor(slug);
  const [domain] = await db().select().from(s.domains).where(and(eq(s.domains.id, domainId), eq(s.domains.projectId, project.id)));
  if (!domain || domain.hostname === defaultHost(project.slug, env().APPS_DOMAIN)) return;
  await db().transaction(async (tx) => {
    await tx.delete(s.domains).where(eq(s.domains.id, domain.id));
    if (domain.isPrimary) {
      await tx.update(s.domains).set({ isPrimary: true }).where(eq(s.domains.hostname, defaultHost(project.slug, env().APPS_DOMAIN)));
    }
  });
  await queues().ops.add("domain-sync", { kind: "domain-sync", projectId: project.id });
  await audit("domain.removed", domain.hostname, { project: project.name });
  done("removed");
}
