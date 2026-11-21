import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Domain → App → Data, stepped right like the design's project cards.
export function RouteChain({ domain, app, data, addDataHref }: { domain: ReactNode; app: ReactNode; data?: ReactNode; addDataHref?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <ChainRow label="Domain" className="bg-tint-domain">{domain}</ChainRow>
      <ChainRow label="App" className="ml-3.5 bg-tint-app">{app}</ChainRow>
      {data ? (
        <ChainRow label="Data" className="ml-7 bg-tint-data">{data}</ChainRow>
      ) : addDataHref ? (
        <div className="ml-7 flex justify-between gap-2 rounded-[10px] border border-dashed border-border-dashed px-3 py-1.75 text-[13px]">
          <span className="text-muted">Data</span>
          <Link href={addDataHref} className="font-medium text-accent-text hover:text-accent-strong">Add a database</Link>
        </div>
      ) : null}
    </div>
  );
}

function ChainRow({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 justify-between gap-3 rounded-[10px] px-3 py-2 text-[13px]", className)}>
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{children}</span>
    </div>
  );
}
