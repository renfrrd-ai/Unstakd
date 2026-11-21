"use server";

import { addDomain } from "@/app/projects/[slug]/domains/actions";
import type { FormState } from "@/lib/validation";

// Add from the Domains page: same checks as the project tab, with the project picked in the form.
export async function addDomainToProject(prev: FormState, data: FormData): Promise<FormState> {
  const slug = String(data.get("project") ?? "");
  if (!slug) return { error: "Pick a project" };
  return addDomain(slug, prev, data);
}
