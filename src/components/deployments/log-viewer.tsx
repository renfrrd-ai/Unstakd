"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { stamp, type LogLine } from "@/lib/log-format";

const levelClass: Record<LogLine["level"], string> = {
  info: "text-log-text",
  warn: "text-log-warn",
  err: "text-log-err",
  step: "text-log-cmd",
};

// Dark log panel from the design. Streams JSON LogLine messages from `streamUrl` (SSE) after `initial`.
// Remount it (key) when the source changes; lines live in local state.
export function LogViewer({
  initial,
  streamUrl,
  title,
  actions,
  toolbar,
  empty = "No output yet.",
  className,
  clock = false,
}: {
  initial: LogLine[];
  streamUrl?: string;
  title?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  empty?: string;
  className?: string;
  clock?: boolean;
}) {
  const [lines, setLines] = useState(initial);
  const [live, setLive] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (!streamUrl) return;
    const es = new EventSource(streamUrl);
    es.onopen = () => setLive(true);
    es.addEventListener("reset", () => setLines([]));
    es.onmessage = (e) => {
      const line = JSON.parse(e.data) as LogLine;
      setLines((prev) => (prev.length > 5000 ? [...prev.slice(-4000), line] : [...prev, line]));
    };
    es.addEventListener("end", () => {
      setLive(false);
      es.close();
    });
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [streamUrl]);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-[18px] bg-log-bg text-log-text", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-log-border px-5.5 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">{title}</div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <span className="font-mono text-xs text-log-muted" aria-live="polite">
            {live ? <><span className="text-log-ok">●</span> streaming</> : `${lines.length} lines`}
          </span>
        </div>
      </div>
      {toolbar && <div className="flex flex-wrap gap-2 px-5.5 pt-3.5">{toolbar}</div>}
      <div
        ref={box}
        role="log"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="max-h-[560px] min-h-75 overflow-auto px-5.5 pt-4 pb-5.5 font-mono text-xs leading-[1.7]"
      >
        {lines.length === 0 ? (
          <span className="text-log-dim">{empty}</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="flex gap-4">
              <span className="shrink-0 text-log-dim select-none" suppressHydrationWarning>
                {clock ? new Date(l.at).toLocaleTimeString("en-CA", { hour12: false }) : stamp(l.at)}
              </span>
              <span className={cn("min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap", levelClass[l.level])}>{l.text}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// Segmented Build / Runtime switch for the dark panel header (links, so the server picks the source).
export function LogTabs({ items }: { items: { label: string; href: string; active: boolean }[] }) {
  return (
    <div role="group" aria-label="Log type" className="flex gap-0.5 rounded-[10px] bg-log-chip p-0.75">
      {items.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          scroll={false}
          aria-current={t.active ? "true" : undefined}
          className={cn("rounded-lg px-3 py-1.5 text-xs font-medium", t.active ? "bg-log-chip-on text-log-text" : "text-log-muted hover:text-log-text")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
