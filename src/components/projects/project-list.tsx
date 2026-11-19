"use client";

import { useEffect, useRef, useState } from "react";
import { List, ListRow, Mono } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { healthPill, type ProjectHealth } from "@/lib/status";
import { Elapsed } from "./elapsed";

export type ProjectRow = {
  slug: string;
  name: string;
  host: string;
  detail: string;
  health: ProjectHealth;
  buildingSince?: string;
};

export function ProjectList({ rows, title }: { rows: ProjectRow[]; title: string }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.host.toLowerCase().includes(q)) : rows;
  const count = (h: ProjectHealth) => rows.filter((r) => r.health === h).length;
  const parts = [`${rows.length} app${rows.length === 1 ? "" : "s"}`];
  if (count("live")) parts.push(`${count("live")} live`);
  if (count("building")) parts.push(`${count("building")} building`);
  if (count("attention")) parts.push(`${count("attention")} failing`);
  if (count("standby")) parts.push(`${count("standby")} on standby`);

  return (
    <section aria-labelledby="proj-h" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="proj-h" className="m-0 text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-muted">{parts.join(" · ")}</p>
        </div>
        <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-panel px-3 font-mono text-[13px] text-muted">
          /
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search projects"
            placeholder="search projects"
            className="w-40 border-0 bg-transparent text-text outline-none sm:w-52"
          />
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="m-0 rounded-xl border border-border bg-panel px-5 py-4 text-muted">No projects match “{query}”.</p>
      ) : (
        <List>
          {shown.map((r) => (
            <ListRow key={r.slug} href={`/projects/${r.slug}`}>
              <span className="flex min-w-40 flex-col gap-1">
                <strong>{r.name}</strong>
                <Mono className="text-accent-text">{r.host}</Mono>
              </span>
              <Mono className="text-xs text-muted">{r.detail}</Mono>
              <Pill tone={healthPill[r.health].tone}>
                {healthPill[r.health].label}
                {r.buildingSince && <>&nbsp;<Elapsed since={r.buildingSince} /></>}
              </Pill>
            </ListRow>
          ))}
        </List>
      )}
    </section>
  );
}
