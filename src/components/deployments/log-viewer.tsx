"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { stamp, type LogLine } from "@/lib/log-format";

const levelClass: Record<LogLine["level"], string> = {
  info: "text-soft",
  warn: "text-warn",
  err: "text-err",
  step: "font-semibold text-accent-text",
};

// Streams JSON LogLine messages from `streamUrl` (SSE) after rendering `initial`.
export function LogViewer({ initial, streamUrl, header, empty = "No output yet.", className, clock = false }: { initial: LogLine[]; streamUrl?: string; header?: ReactNode; empty?: string; className?: string; clock?: boolean }) {
  const [lines, setLines] = useState(initial);
  const [live, setLive] = useState(false);
  const box = useRef<HTMLPreElement>(null);
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
    <section className={cn("overflow-hidden rounded-lg border border-border", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-panel px-3.5 py-2">
        <div className="flex gap-1">{header}</div>
        <span className="font-mono text-xs text-muted" aria-live="polite">
          {live ? <><span className="text-accent-text">●</span> streaming</> : `${lines.length} lines`}
        </span>
      </div>
      <pre
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="m-0 max-h-[560px] min-h-48 overflow-auto bg-log-bg px-5 py-4.5 font-mono text-[13px] leading-[1.75] whitespace-pre text-soft"
      >
        {lines.length === 0 ? (
          <span className="text-dim">{empty}</span>
        ) : (
          lines.map((l, i) => (
            <div key={i}>
              <span className="text-dim select-none" suppressHydrationWarning>{clock ? new Date(l.at).toLocaleTimeString("en-CA", { hour12: false }) : stamp(l.at)}</span>
              {"  "}
              <span className={levelClass[l.level]}>{l.text}</span>
            </div>
          ))
        )}
      </pre>
    </section>
  );
}
