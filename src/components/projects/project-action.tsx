import { redeploy } from "@/app/projects/[slug]/actions";
import { setStandby } from "@/app/projects/[slug]/settings/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import type { ProjectView } from "./view";

type Size = "sm" | "md";

// The one thing you'd most likely do next for an app, by its state.
export function ProjectAction({ p, size = "sm", className }: { p: Pick<ProjectView, "slug" | "health" | "latestNumber">; size?: Size; className?: string }) {
  const cls = size === "sm" ? `h-8.5 px-3 text-[13px] ${className ?? ""}` : className;
  if ((p.health === "building" || p.health === "attention") && p.latestNumber != null) {
    return (
      <ButtonLink href={`/projects/${p.slug}/deployments/${p.latestNumber}`} variant="primary" size={size} className={cls}>
        {p.health === "building" ? "View build" : "View failure"}
      </ButtonLink>
    );
  }
  if (p.health === "standby") {
    return (
      <form action={setStandby.bind(null, p.slug, false)}>
        <Button type="submit" variant="primary" size={size} className={cls}>Start</Button>
      </form>
    );
  }
  return (
    <form action={redeploy.bind(null, p.slug)}>
      <Button type="submit" variant="primary" size={size} className={cls}>Deploy</Button>
    </form>
  );
}
