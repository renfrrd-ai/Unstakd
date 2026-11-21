"use client";

import { useState, useTransition } from "react";
import { revealConnection } from "@/app/(main)/databases/actions";

const small = "cursor-pointer rounded-lg border border-border-strong bg-panel px-2.5 py-1.5 text-xs font-medium text-text hover:bg-panel-2 disabled:cursor-wait disabled:opacity-60";

// Masked by default; the real value is fetched (and audited) only on Show or Copy.
export function ConnectionString({ databaseId, masked, label, note }: { databaseId: string; masked: string; label: string; note?: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const fetchValue = async () => value ?? (await revealConnection(databaseId));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex items-center gap-2 rounded-xl bg-sunken py-1.5 pr-1.5 pl-3.5">
        <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap text-soft [scrollbar-width:thin]">{value ?? masked}</code>
        <button type="button" className={small} disabled={pending} onClick={() => start(async () => setValue(value ? null : await revealConnection(databaseId)))}>
          {value ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          className={small}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await navigator.clipboard.writeText(await fetchValue());
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}
