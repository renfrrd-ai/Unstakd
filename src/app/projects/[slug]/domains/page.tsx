import { Suspense } from "react";
import { DomainList } from "@/components/domains/domain-list";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ProjectMain } from "@/components/layout/page";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultHost } from "@/lib/domains";
import { env } from "@/lib/env";
import { loadProject } from "@/server/load-project";
import { listDomains } from "@/server/queries";
import { addDomain, makePrimary, removeDomain } from "./actions";

type Props = PageProps<"/projects/[slug]/domains">;

export default function DomainsPage({ params }: Props) {
  return (
    <ProjectMain>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Domains params={params} />
      </Suspense>
    </ProjectMain>
  );
}

async function Domains({ params }: { params: Props["params"] }) {
  const project = await loadProject(params);
  const rows = await listDomains(project.id);
  const def = defaultHost(project.slug, env().APPS_DOMAIN);

  return (
    <section aria-labelledby="domains-h" className="flex flex-col gap-4">
      <SectionHeader
        id="domains-h"
        title="Domains"
        description={<>Point a CNAME at <span className="font-mono text-xs text-text">{env().EDGE_HOST}</span>, or an A record for a root domain. HTTPS is issued automatically once DNS resolves.</>}
        action={
          <ActionForm action={addDomain.bind(null, project.slug)}>
            
              <div className="flex flex-wrap gap-2">
                <label htmlFor="new-domain" className="sr-only">Add domain</label>
                <Input id="new-domain" name="hostname" mono required placeholder="photos.example.com" className="w-64" autoComplete="off" />
                <SubmitButton pendingLabel="Adding…">Add domain</SubmitButton>
              </div>
          </ActionForm>
        }
      />
      <DomainList
        domains={rows.map((r) => r.domain)}
        defaultHost={def}
        extra={(d) => (
          <>
            {!d.isPrimary && d.status === "active" && (
              <form action={makePrimary.bind(null, project.slug, d.id)}>
                <button type="submit" className="cursor-pointer rounded-lg bg-panel-2 px-2.5 py-1 text-xs font-medium hover:brightness-95">Make primary</button>
              </form>
            )}
            {d.hostname !== def && (
              <form action={removeDomain.bind(null, project.slug, d.id)}>
                <ConfirmButton message={`Remove ${d.hostname}? It will stop serving this app.`} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-err hover:bg-err-bg">Remove</ConfirmButton>
              </form>
            )}
          </>
        )}
      />
    </section>
  );
}
