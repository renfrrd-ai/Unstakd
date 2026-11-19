import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import type { Domain } from "@/db/schema";
import { requiredRecord } from "@/lib/dns";
import { env } from "@/lib/env";
import { timeAgo } from "@/lib/format";

function statusPill(d: Domain) {
  switch (d.status) {
    case "active":
      return <Pill tone="ok">Active · HTTPS</Pill>;
    case "verified":
      return <Pill tone="warn">DNS ok · issuing certificate</Pill>;
    case "misconfigured":
      return <Pill tone="err">DNS points elsewhere</Pill>;
    default:
      return <Pill tone="waiting">Waiting for DNS · checked {timeAgo(d.lastCheckedAt)}</Pill>;
  }
}

export function DomainList({ domains, defaultHost, extra }: { domains: Domain[]; defaultHost?: string; extra?: (d: Domain) => ReactNode }) {
  if (domains.length === 0) return <EmptyState title="No domains">Add one above.</EmptyState>;
  const { EDGE_HOST, EDGE_IP } = env();
  const primary = domains.find((d) => d.isPrimary);

  return (
    <ul className="m-0 list-none overflow-hidden rounded-xl border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border">
      {domains.map((d) => {
        const needsDns = d.status === "pending" || d.status === "misconfigured";
        const rec = requiredRecord(d.hostname, EDGE_HOST, EDGE_IP);
        const note = d.isPrimary ? "primary" : d.hostname === defaultHost ? "default" : primary && d.hostname.replace(/^www\./, "") === primary.hostname.replace(/^www\./, "") ? "redirects to primary" : null;
        return (
          <li key={d.id} className={needsDns ? (d.status === "misconfigured" ? "bg-err-bg" : "bg-warn-bg") : undefined}>
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono break-all">{d.hostname}</span>
                  {note && <span className="text-xs text-muted">{note}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {statusPill(d)}
                  {extra?.(d)}
                </div>
              </div>
              {needsDns && (
                <div className="overflow-x-auto">
                  <table className="min-w-[480px] border-collapse text-[13px]">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-1 pr-6 font-medium">Type</th>
                        <th className="py-1 pr-6 font-medium">Name</th>
                        <th className="py-1 pr-6 font-medium">Value</th>
                        <th><span className="sr-only">Copy</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="font-mono">
                        <td className="py-1 pr-6">{rec.type}</td>
                        <td className="py-1 pr-6">{rec.name}</td>
                        <td className="py-1 pr-6">{rec.value}</td>
                        <td><CopyButton value={rec.value} /></td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-2 mb-0 text-xs text-muted">Behind Cloudflare? Use “DNS only” (grey cloud) so the certificate can be issued here.</p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
