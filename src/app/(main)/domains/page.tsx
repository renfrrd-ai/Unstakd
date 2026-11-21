import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DnsRecords, DnsTile, domainStatus } from "@/components/domains/domain-list";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { PageMain, PageTitle } from "@/components/layout/page";
import { RouteChain } from "@/components/projects/route-chain";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { CardHeader, EmptyState, KeyValues, Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { SoonButton } from "@/components/ui/soon";
import { cn } from "@/lib/cn";
import { requiredRecord } from "@/lib/dns";
import { defaultHost } from "@/lib/domains";
import { env } from "@/lib/env";
import { timeAgo } from "@/lib/format";
import { listDomains, listProjects } from "@/server/queries";
import { addDomainToProject } from "./actions";

export const metadata: Metadata = { title: "Domains" };

type Props = PageProps<"/domains">;

export default function DomainsPage({ searchParams }: Props) {
  return (
    <PageMain className="gap-6">
      <Suspense fallback={<><Skeleton className="h-16 border-0 bg-transparent" /><Skeleton className="h-80" /></>}>
        <Domains searchParams={searchParams} />
      </Suspense>
    </PageMain>
  );
}

async function Domains({ searchParams }: { searchParams: Props["searchParams"] }) {
  const [rows, projects, params] = await Promise.all([listDomains(), listProjects(), searchParams]);
  const { APPS_DOMAIN, EDGE_HOST, EDGE_IP } = env();
  const connected = rows.filter((r) => r.domain.status === "active" || r.domain.status === "verified").length;
  const waiting = rows.length - connected;

  const addForm = (
    <details className="relative">
      <summary className={cn(buttonClass("primary"), "list-none [&::-webkit-details-marker]:hidden")}>Add domain</summary>
      <Panel className="absolute right-0 z-20 mt-2 w-[min(360px,calc(100vw-32px))] p-5 shadow-pop">
        <ActionForm action={addDomainToProject}>
          <Field label="Project">
            <Select name="project" required defaultValue="">
              <option value="" disabled>Pick a project</option>
              {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Hostname">
            <Input name="hostname" mono required placeholder="photos.example.com" autoComplete="off" />
          </Field>
          <SubmitButton variant="primary" pendingLabel="Adding…" className="self-start">Add domain</SubmitButton>
        </ActionForm>
      </Panel>
    </details>
  );

  const header = (
    <PageTitle
      title="Domains"
      description={rows.length ? `${connected} connected${waiting ? `, ${waiting} waiting for DNS` : ""}. SSL certificates renew on their own.` : "Custom domains for your apps. SSL certificates renew on their own."}
      actions={projects.length ? addForm : undefined}
    />
  );
  if (rows.length === 0) {
    return (
      <>
        {header}
        <EmptyState title="No domains yet">
          <span>Every app gets <span className="font-mono text-xs">&lt;name&gt;.{APPS_DOMAIN}</span> when it&apos;s created; add your own domain from here or the project&apos;s Domains tab.</span>
        </EmptyState>
      </>
    );
  }

  const wanted = typeof params.d === "string" ? params.d : undefined;
  const sel = rows.find((r) => r.domain.hostname === wanted) ?? rows.find((r) => r.domain.status !== "active") ?? rows[0];
  const selStatus = domainStatus(sel.domain);
  const pending = sel.domain.status === "pending" || sel.domain.status === "misconfigured";
  const active = sel.domain.status === "active";
  const isDefault = sel.domain.hostname === defaultHost(sel.project.slug, APPS_DOMAIN);

  return (
    <>
      {header}
      <section aria-label="Domain list" className="overflow-hidden rounded-[18px] border border-border bg-panel shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="text-xs text-muted">
                <th className="border-b border-border px-5 py-3.5 font-medium">Domain</th>
                <th className="border-b border-border px-3 py-3.5 font-medium">Points to</th>
                <th className="border-b border-border px-3 py-3.5 font-medium">DNS</th>
                <th className="border-b border-border px-3 py-3.5 font-medium">SSL</th>
                <th className="border-b border-border px-5 py-3.5 font-medium">Certificate renews</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ domain: d, project }) => {
                const st = domainStatus(d);
                const isSel = d.id === sel.domain.id;
                return (
                  <tr key={d.id} className={isSel ? "bg-selected" : "hover:bg-sunken"}>
                    <td className="border-b border-border px-5 py-3.5">
                      <Link href={`/domains?d=${encodeURIComponent(d.hostname)}`} scroll={false} aria-current={isSel ? "true" : undefined} className="flex items-center gap-2.5 font-semibold text-text hover:text-accent-text">
                        <DnsTile />
                        <span className="flex flex-col">
                          <span className="break-all">{d.hostname}</span>
                          {(d.isPrimary || d.hostname === defaultHost(project.slug, APPS_DOMAIN)) && (
                            <span className="text-xs font-normal text-muted">{d.isPrimary ? "primary" : "default"}</span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="border-b border-border px-3 py-3.5">
                      <Link href={`/projects/${project.slug}`} className="text-soft hover:text-accent-text">{project.name}</Link>
                    </td>
                    <td className="border-b border-border px-3 py-3.5"><Pill tone={st.tone}>{st.dns}</Pill></td>
                    <td className={cn("border-b border-border px-3 py-3.5 text-[13px] font-medium", d.status === "active" ? "text-ok" : "text-muted")}>{st.ssl}</td>
                    <td className="border-b border-border px-5 py-3.5 text-soft">{d.status === "active" ? "Automatic, before expiry" : "Not issued yet"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 px-5 py-3.5 text-[13px] text-muted">
          Every app also answers on <span className="font-mono text-xs">&lt;name&gt;.{APPS_DOMAIN}</span>. Checked every minute.
        </p>
      </section>

      <div className="flex flex-wrap items-stretch gap-6">
        <section aria-labelledby="records-h" className="flex min-w-0 flex-[999_1_560px] flex-col gap-4 rounded-[18px] border border-border bg-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted">{pending ? "Records to add" : "DNS records"}</span>
              <h2 id="records-h" className="m-0 text-[22px] font-bold tracking-[-0.02em] break-all">{sel.domain.hostname}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <SoonButton>Add record</SoonButton>
              <ButtonLink href={`/projects/${sel.project.slug}/domains`} variant="primary">Manage in {sel.project.name}</ButtonLink>
            </div>
          </div>
          {pending && (
            <p className={cn("m-0 rounded-xl px-3.5 py-3 text-[13px]", sel.domain.status === "misconfigured" ? "bg-err-bg text-err" : "bg-warn-bg text-warn")}>
              {sel.domain.status === "misconfigured"
                ? "This domain resolves somewhere else. Point it back here with the record below; it's rechecked every minute."
                : `Add this record at the company you bought the domain from. Changes can take up to an hour to show up; last checked ${timeAgo(sel.domain.lastCheckedAt)}.`}
            </p>
          )}
          {isDefault ? (
            <p className="m-0 text-[13px] text-muted">Assigned automatically under {APPS_DOMAIN}; there&apos;s nothing to configure.</p>
          ) : (
            <DnsRecords records={[requiredRecord(sel.domain.hostname, EDGE_HOST, EDGE_IP)]} verified={!pending} />
          )}
          <span className="text-xs text-muted">
            Server address {EDGE_IP || "not set (EDGE_IP)"} · edge host <span className="font-mono">{EDGE_HOST}</span>. Behind Cloudflare? Use “DNS only” so the certificate can be issued here.
          </span>
        </section>
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Panel className="flex flex-col gap-3 p-5.5">
            <CardHeader as="h3" title="Certificate" />
            <KeyValues
              rows={[
                ["Status", <span key="s" className={active ? "text-ok" : "text-muted"}>{selStatus.ssl}</span>],
                ["Issuer", active ? "Let's Encrypt" : "Not issued yet"],
                ["Renews", active ? "Automatic" : "After DNS resolves"],
              ]}
            />
          </Panel>
          <Panel className="flex flex-col gap-3 p-5.5">
            <CardHeader as="h3" title="Routing" />
            <RouteChain domain={sel.domain.hostname} app={<Link href={`/projects/${sel.project.slug}`} className="hover:text-accent-text">{sel.project.name}</Link>} />
            <Link href={`/map?focus=${encodeURIComponent(`d:${sel.domain.hostname}`)}`} className="text-[13px] font-medium text-accent-text hover:text-accent-strong">See it on the map →</Link>
          </Panel>
        </aside>
      </div>
    </>
  );
}
