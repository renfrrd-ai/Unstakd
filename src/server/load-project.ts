import "server-only";
import { notFound } from "next/navigation";
import { getProject } from "./queries";

export async function loadProject(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  return project;
}
