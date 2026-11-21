import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/panel";
import { Pill, type Tone } from "@/components/ui/pill";
import type { Domain } from "@/db/schema";
import { cn } from "@/lib/cn";
import { requiredRecord, type DnsRecord } from "@/lib/dns";
import { env } from "@/lib/env";
import { timeAgo } from "@/lib/format";

export function domainStatus(d: Pick<Domain, "status" | "lastCheckedAt">): { tone: Tone; dns: string; label: string; ssl: string } {
  switch (d.status) {
    case "active":
      return { tone: "ok", dns: "Connected", label: "Active · HTTPS", ssl: "Valid" };
    case "verified":
      return { tone: "warn", dns: "Connected", label: "DNS ok · issuing certificate", ssl: "Issuing" };
    case "misconfigured":
      return { tone: "err", dns: "Points elsewhere", label: "DNS points elsewhere", ssl: "Not served" };
    default:
      return { tone: "waiting", dns: "Waiting", label: `Waiting for DNS · checked ${timeAgo(d.lastCheckedAt)}`, ssl: "Issued after DNS" };
  }
}

export function DnsTile({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex size-7.5 shrink-0 items-center justify-center rounded-[9px] bg-tint-domain-strong text-[10px] font-semibold text-soft", className)}>
      DNS
    </span>
  );
}

// The record to create at the registrar, with its verification state.
export function DnsRecords({ records, verified }: { records: DnsRecord[]; verified: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="text-xs text-muted">
            <th className="border-b border-border py-2 pr-3 font-medium">Type</th>
            <th className="border-b border-border px-3 py-2 font-medium">Name</th>
            <th className="border-b border-border px-3 py-2 font-medium">Value</th>
            <th className="border-b border-border px-3 py-2 font-medium">Status</th>
            <th className="border-b border-border py-2 pl-3"><span className="sr-only">Copy</span></th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={`${r.type}-${r.name}`}>
              <td className="border-b border-border py-2.75 pr-3">
                <span className="rounded-md bg-panel-2 px-2 py-0.5 text-[11px] font-semibold">{r.type}</span>
              </td>
              <td className="border-b border-border px-3 py-2.75 font-mono text-xs">{r.name}</td>
              <td className="border-b border-border px-3 py-2.75 font-mono text-xs break-all text-soft">{r.value}</td>
              <td className={cn("border-b border-border px-3 py-2.75 text-xs font-medium whitespace-nowrap", verified ? "text-ok" : "text-warn")}>{verified ? "Verified" : "Not found yet"}</td>
              <td className="border-b border-border py-2 pl-3 text-right"><CopyButton value={r.value} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DomainList({ domains, defaultHost, extra, compact }: { domains: Domain[]; defaultHost?: string; extra?: (d: Domain) => ReactNode; compact?: boolean }) {
  if (domains.length === 0) return <EmptyState title="No domains">Add one above.</EmptyState>;
  const { EDGE_HOST, EDGE_IP } = env();
  const primary = domains.find((d) => d.isPrimary);

  return (
    <ul className="m-0 list-none overflow-hidden rounded-[18px] border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border">
      {domains.map((d) => {
        const needsDns = d.status === "pending" || d.status === "misconfigured";
        const st = domainStatus(d);
        const note = d.isPrimary ? "primary" : d.hostname === defaultHost ? "default" : primary && d.hostname.replace(/^www\./, "") === primary.hostname.replace(/^www\./, "") ? "redirects to primary" : null;
        return (
          <li key={d.id} className={cn("flex flex-col gap-3", compact ? "px-4 py-3.5" : "px-5 py-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <DnsTile />
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold break-all">{d.hostname}</span>
                  {note && <span className="text-xs text-muted">{note}</span>}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Pill tone={st.tone}>{compact ? st.dns : st.label}</Pill>
                {extra?.(d)}
              </div>
            </div>
            {needsDns && (
              <div className={cn("flex flex-col gap-2 rounded-xl p-3", d.status === "misconfigured" ? "bg-err-bg" : "bg-warn-bg")}>
                <DnsRecords records={[requiredRecord(d.hostname, EDGE_HOST, EDGE_IP)]} verified={false} />
                <p className="m-0 text-xs text-muted">Behind Cloudflare? Use “DNS only” (grey cloud) so the certificate can be issued here.</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
