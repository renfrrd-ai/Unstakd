"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PageTitle } from "@/components/layout/page";
import { hotText, Meter, pctText } from "@/components/ui/meter";
import { Pill } from "@/components/ui/pill";
import { SoonBadge } from "@/components/ui/soon";
import { cn } from "@/lib/cn";
import { bytes } from "@/lib/format";
import { healthPill, type ProjectHealth } from "@/lib/status";
import { vcpu } from "@/lib/usage";
import { Elapsed } from "./elapsed";
import type { ProjectView } from "./view";

type Filter = "all" | ProjectHealth;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "building", label: "Building" },
  { id: "attention", label: "Failed" },
  { id: "standby", label: "Standby" },
];

const th = "px-3 py-3.5 text-xs font-medium text-muted border-b border-border text-left whitespace-nowrap";
const td = "px-3 py-3.5 border-b border-border";

export function ProjectTable({ rows, selected, logTab, footer, description }: { rows: ProjectView[]; selected?: string; logTab: string; footer: { label: string; cpu: string; mem: string }; description: ReactNode }) {
  const [filter, setFilter] = useState<Filter>("all");
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
  const shown = rows
    .filter((r) => filter === "all" || r.health === filter)
    .filter((r) => !q || `${r.name} ${r.host} ${r.stack} ${r.repo}`.toLowerCase().includes(q));
  const count = (f: Filter) => (f === "all" ? rows.length : rows.filter((r) => r.health === f).length);
  const filters = FILTERS.filter((f) => f.id === "all" || count(f.id) > 0 || f.id === "live");

  return (
    <>
      <PageTitle
        title="Projects"
        description={description}
        actions={
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-xl bg-panel-2 p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "cursor-pointer rounded-[9px] px-3 py-1.75 text-[13px] font-medium text-text",
                filter === f.id && "bg-panel font-semibold shadow-soft",
              )}
            >
              {f.label} <span className="font-medium text-muted">{count(f.id)}</span>
            </button>
          ))}
        </div>
        <label className="flex h-10 w-full items-center gap-2 rounded-[10px] border border-border-strong bg-panel px-3 sm:w-60">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search projects"
            placeholder="Search projects"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-text outline-none placeholder:text-dim"
          />
          <kbd className="rounded border border-border px-1.5 font-mono text-[11px] text-dim">/</kbd>
        </label>
      </div>
        }
      />

      <section aria-label="Project table" className="overflow-hidden rounded-[18px] border border-border bg-panel shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead>
              <tr>
                <th className={cn(th, "pl-5")}>Status</th>
                <th className={th}>Name</th>
                <th className={th}>Stack</th>
                <th className={th}>Commit</th>
                <th className={th}>Deployed</th>
                <th className={th}>Domain</th>
                <th className={th}>CPU of allocation</th>
                <th className={th}>Memory</th>
                <th className={cn(th, "pr-5 text-right")}>
                  <span className="inline-flex items-center gap-1.5">Cost / mo <SoonBadge /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const pill = healthPill[r.health];
                const isSel = r.slug === selected;
                return (
                  <tr key={r.slug} className={cn(isSel ? "bg-selected" : "hover:bg-sunken")}>
                    <td className={cn(td, "pl-5")}>
                      <Pill tone={pill.tone}>
                        {pill.label}
                        {r.buildingSince && <>&nbsp;<Elapsed since={r.buildingSince} /></>}
                      </Pill>
                    </td>
                    <td className={td}>
                      <Link href={`/projects?p=${r.slug}&log=${logTab}`} scroll={false} aria-current={isSel ? "true" : undefined} className="flex flex-col font-semibold text-text hover:text-accent-text">
                        <span>{r.name}</span>
                        <span className="text-xs font-normal whitespace-nowrap text-muted">{r.repo}</span>
                      </Link>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-soft")}>{r.stack}</td>
                    <td className={cn(td, "font-mono text-xs text-soft")}>{r.commit}</td>
                    <td className={cn(td, "whitespace-nowrap text-soft")}>{r.deployed}</td>
                    <td className={td}>
                      <Link href={`/projects/${r.slug}`} className="font-medium whitespace-nowrap text-accent-text hover:text-accent-strong">{r.host}</Link>
                    </td>
                    <td className={td}>
                      {r.isStatic ? (
                        <span className="text-[13px] text-muted">static, none</span>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <Meter percent={r.cpu} label={`${r.name} CPU of allocation`} className="w-18 shrink-0" />
                          <span className="text-[13px] whitespace-nowrap">
                            <span className={cn("font-semibold", hotText(r.cpu))}>{pctText(r.cpu)}</span> <span className="text-muted">of {vcpu(r.alloc)}</span>
                          </span>
                        </div>
                      )}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-soft")}>{r.memBytes != null ? bytes(r.memBytes) : "—"}</td>
                    <td className={cn(td, "pr-5 text-right text-dim")}>—</td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={6} className="px-5 py-3.5 text-[13px] text-muted">{footer.label}</td>
                <td className="px-3 py-3.5 text-[13px]">{footer.cpu}</td>
                <td className="px-3 py-3.5 text-[13px] text-soft">{footer.mem}</td>
                <td className="px-5 py-3.5 text-right text-dim">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <p className="m-0 p-5 text-center text-muted">{rows.length ? "No projects match that search." : "No projects yet."}</p>}
      </section>
    </>
  );
}
