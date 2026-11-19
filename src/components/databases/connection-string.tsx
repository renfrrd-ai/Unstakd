"use client";

import { useState, useTransition } from "react";
import { revealConnection } from "@/app/(main)/databases/actions";
import { Button } from "@/components/ui/button";

export function ConnectionString({ databaseId, masked, label }: { databaseId: string; masked: string; label: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const fetchValue = async () => value ?? (await revealConnection(databaseId));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex-[1_1_420px] overflow-x-auto rounded-lg border border-border bg-bg px-3.5 py-3 font-mono text-[13px] whitespace-nowrap">
          {value ?? masked}
        </code>
        <Button
          disabled={pending}
          onClick={() => start(async () => setValue(value ? null : await revealConnection(databaseId)))}
        >
          {value ? "Hide" : "Reveal"}
        </Button>
        <Button
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
        </Button>
      </div>
    </div>
  );
}
