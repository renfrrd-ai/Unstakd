"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { redeploy } from "@/app/projects/[slug]/actions";
import { setStandby } from "@/app/projects/[slug]/settings/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { KeyValues } from "@/components/ui/panel";
import { Dot, Pill } from "@/components/ui/pill";
import { cn } from "@/lib/cn";
import { bounds, edgePath, NODE_H, NODE_W, type MapEdge, type MapKind, type MapNode } from "@/lib/map-graph";

type Pos = Record<string, { x: number; y: number }>;
type Drag = { type: "node"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | { type: "pan"; sx: number; sy: number; ox: number; oy: number };

const STORE = "unstakd-map-layout-v1";
const MIN_Z = 0.35;
const MAX_Z = 2.5;
const READABLE_Z = 0.8;

const tile: Record<MapKind, string> = { domain: "bg-tint-domain-strong", app: "bg-tint-app-strong", data: "bg-tint-data-strong" };
const short: Record<MapKind, string> = { domain: "DNS", app: "APP", data: "DB" };
const kindLabel: Record<MapKind, string> = { domain: "Domain", app: "App", data: "Database" };

function loadSaved(nodes: MapNode[]): Pos {
  const pos: Pos = Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Pos;
    for (const id of Object.keys(saved)) if (pos[id] && Number.isFinite(saved[id]?.x) && Number.isFinite(saved[id]?.y)) pos[id] = saved[id];
  } catch {}
  return pos;
}

function save(pos: Pos) {
  try {
    localStorage.setItem(STORE, JSON.stringify(pos));
  } catch {}
}

export function MapCanvas({ nodes, edges, zoneLabel, focus }: { nodes: MapNode[]; edges: MapEdge[]; zoneLabel: string; focus?: string }) {
  const defaults = useMemo<Pos>(() => Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }])), [nodes]);
  // Rendered client-only (see map-client.tsx), so the saved layout can be the initial state.
  const [pos, setPos] = useState<Pos>(() => loadSaved(nodes));
  const [view, setView] = useState({ z: 1, px: 0, py: 0 });
  const [sel, setSel] = useState<string | null>(focus && nodes.some((n) => n.id === focus) ? focus : (nodes.find((n) => n.kind === "app")?.id ?? null));
  const [dragId, setDragId] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const vp = useRef<HTMLDivElement | null>(null);
  const fitted = useRef(false);
  const drag = useRef<Drag | null>(null);
  const viewRef = useRef(view);
  const posRef = useRef(pos);
  useEffect(() => {
    viewRef.current = view;
    posRef.current = pos;
  }, [view, pos]);

  // `readable` keeps text legible on big maps: zoom no lower than that and start at the top; pan for the rest.
  const fit = useCallback((p: Pos, readable = false) => {
    const el = vp.current;
    if (!el) return;
    const b = bounds(Object.values(p));
    // Leave room for the zone label above and the legend below.
    const top = 64;
    const bottom = 72;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const all = Math.min(1.25, Math.max(MIN_Z, Math.min((w - 64) / b.w, (h - top - bottom) / b.h)));
    const z = readable ? Math.max(all, Math.min(READABLE_Z, (w - 64) / b.w)) : all;
    const tall = b.h * z > h - top - bottom;
    setView({ z, px: (w - b.w * z) / 2 - b.x * z, py: tall ? top - b.y * z : top + (h - top - bottom - b.h * z) / 2 - b.y * z });
  }, []);

  // Frame the map once the viewport has a size.
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      vp.current = el;
      if (el && !fitted.current) {
        fitted.current = true;
        const target = focus ? pos[focus] : undefined;
        // A deep link (/map?focus=…) centres its block; otherwise frame the whole map.
        if (target) setView({ z: 1, px: el.clientWidth / 2 - (target.x + NODE_W / 2), py: el.clientHeight / 2 - (target.y + NODE_H / 2) });
        else fit(pos, true);
      }
    },
    [fit, pos, focus],
  );

  const zoomAt = useCallback((mx: number, my: number, target: number) => {
    setView(({ z, px, py }) => {
      const nz = Math.min(MAX_Z, Math.max(MIN_Z, target));
      const wx = (mx - px) / z;
      const wy = (my - py) / z;
      return { z: nz, px: mx - wx * nz, py: my - wy * nz };
    });
  }, []);

  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, viewRef.current.z * Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const zoomCenter = (f: number) => {
    const el = vp.current;
    if (el) zoomAt(el.clientWidth / 2, el.clientHeight / 2, view.z * f);
  };

  const onNodeDown = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { type: "node", id, sx: e.clientX, sy: e.clientY, ox: pos[id].x, oy: pos[id].y, moved: false };
    setDragId(id);
  };

  const onBgDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: view.px, oy: view.py };
    setPanning(true);
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.type === "node") {
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setPos((p) => ({ ...p, [d.id]: { x: d.ox + dx / view.z, y: d.oy + dy / view.z } }));
    } else {
      setView((v) => ({ ...v, px: d.ox + dx, py: d.oy + dy }));
    }
  };

  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.type === "node") {
      // A press without movement is a click: select it. A drag keeps the selection as is.
      if (!d.moved) setSel(d.id);
      else save(posRef.current);
    }
    setDragId(null);
    setPanning(false);
  };

  const tidy = () => {
    try {
      localStorage.removeItem(STORE);
    } catch {}
    setPos(defaults);
    fit(defaults);
  };

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const apps = nodes.filter((n) => n.kind === "app");
  const zone = apps.length ? bounds(apps.map((n) => pos[n.id] ?? n)) : null;
  const selected = sel ? byId.get(sel) : undefined;
  const links = selected ? edges.filter((e) => e.from === selected.id || e.to === selected.id).map((e) => byId.get(e.from === selected.id ? e.to : e.from)!) : [];
  const grid = Math.max(8, Math.round(22 * view.z));

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div
        ref={attach}
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={cn(
          "relative h-[520px] min-w-0 flex-[999_1_560px] touch-none overflow-hidden rounded-[20px] border border-border bg-panel shadow-card select-none sm:h-[660px]",
          panning ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{
          backgroundImage: "radial-gradient(var(--border-dashed) 1px, transparent 1px)",
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${view.px}px ${view.py}px`,
        }}
      >
        <div className="absolute top-0 left-0 size-px origin-top-left" style={{ transform: `translate(${view.px}px, ${view.py}px) scale(${view.z})` }}>
          {zone && (
            <>
              <div
                aria-hidden
                className="absolute rounded-[22px] border-[1.5px] border-dashed border-border-dashed bg-panel/60"
                style={{ left: zone.x - 28, top: zone.y - 50, width: zone.w + 56, height: zone.h + 78 }}
              />
              <span className="absolute text-xs font-medium whitespace-nowrap text-muted" style={{ left: zone.x - 8, top: zone.y - 38 }}>
                {zoneLabel}
              </span>
            </>
          )}
          <svg aria-hidden className="absolute top-0 left-0 overflow-visible" width="1" height="1">
            {edges.map((e) => {
              const a = pos[e.from];
              const b = pos[e.to];
              if (!a || !b) return null;
              const hl = e.from === sel || e.to === sel;
              const d = edgePath(a, b);
              return (
                <g key={`${e.from}-${e.to}`} className={hl ? "text-accent" : "text-edge"}>
                  <path d={d} fill="none" stroke="currentColor" strokeWidth={hl ? 2 : 1.5} strokeDasharray={e.dashed ? "5 4" : undefined} strokeLinejoin="round" />
                </g>
              );
            })}
          </svg>
          {nodes.map((n) => {
            const p = pos[n.id] ?? n;
            const isSel = n.id === sel;
            return (
              <button
                key={n.id}
                type="button"
                aria-label={`${n.name}, ${kindLabel[n.kind]}, ${n.status}`}
                aria-pressed={isSel}
                onPointerDown={(e) => onNodeDown(e, n.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSel(n.id);
                  }
                }}
                className={cn(
                  "absolute flex touch-none items-center gap-3 rounded-[14px] bg-panel py-0 pr-3.5 pl-3 text-left text-text",
                  dragId === n.id ? "cursor-grabbing shadow-pop" : "cursor-grab shadow-soft",
                  isSel
                    ? "border-[1.5px] border-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_16%,transparent)]"
                    : n.dashed
                      ? "border-[1.5px] border-dashed border-border-dashed"
                      : "border border-border-strong",
                )}
                style={{ left: Math.round(p.x), top: Math.round(p.y), width: NODE_W, height: NODE_H }}
              >
                <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[11px] font-semibold text-soft", tile[n.kind])}>
                  {short[n.kind]}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-semibold">{n.name}</span>
                  <span className="truncate text-xs text-muted">{n.meta}</span>
                </span>
                <Dot tone={n.tone} pulse={n.tone === "warn"} className="size-2" />
              </button>
            );
          })}
        </div>

        {nodes.length === 0 && (
          <p className="absolute inset-0 m-0 flex items-center justify-center p-8 text-center text-muted">
            Nothing to map yet. Deploy a project and it shows up here with its domains and databases.
          </p>
        )}

        <div onPointerDown={(e) => e.stopPropagation()} className="absolute bottom-4 left-4 flex flex-wrap gap-3.5 rounded-xl border border-border bg-panel/90 px-3 py-2 text-xs text-muted max-sm:right-24">
          {(["domain", "app", "data"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-3 rounded", tile[k])} />
              {kindLabel[k] === "Database" ? "Data" : kindLabel[k]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t-[1.5px] border-dashed border-edge" />
            Not serving yet
          </span>
        </div>
        <div onPointerDown={(e) => e.stopPropagation()} className="absolute right-4 bottom-4 flex items-center rounded-xl border border-border bg-panel shadow-soft">
          <button type="button" aria-label="Zoom out" onClick={() => zoomCenter(1 / 1.2)} className="size-11 cursor-pointer text-lg text-text">−</button>
          <span className="min-w-12 text-center text-xs font-medium text-soft" aria-live="polite">{Math.round(view.z * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => zoomCenter(1.2)} className="size-11 cursor-pointer text-lg text-text">+</button>
        </div>
        <div onPointerDown={(e) => e.stopPropagation()} className="absolute top-4 right-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={tidy}>Tidy layout</Button>
          <Button variant="primary" size="sm" onClick={() => fit(pos)}>Fit to screen</Button>
        </div>
      </div>

      <aside aria-label="Selected block" className="flex min-w-0 flex-[1_1_320px] flex-col gap-5.5 rounded-[20px] border border-border bg-panel p-6 shadow-card sm:min-h-[660px]">
        {selected ? (
          <>
            <div className="flex items-center gap-3">
              <span aria-hidden className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold text-soft", tile[selected.kind])}>
                {short[selected.kind]}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-xs text-muted">{kindLabel[selected.kind]}</span>
                <h2 className="m-0 text-[22px] leading-tight font-bold tracking-[-0.02em] break-all">{selected.name}</h2>
              </div>
              <span className="ml-auto">
                <Pill tone={selected.tone} dot={false}>{selected.status}</Pill>
              </span>
            </div>
            <KeyValues rows={selected.info} />
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-medium text-muted">Connected to</span>
              {links.length ? (
                <div className="flex flex-wrap gap-2">
                  {links.map((l) => (
                    <button key={l.id} type="button" onClick={() => setSel(l.id)} className={cn("cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-medium hover:brightness-95", tile[l.kind])}>
                      {l.name}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[13px] text-muted">Nothing yet.</span>
              )}
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Actions node={selected} />
            </div>
          </>
        ) : (
          <p className="m-0 text-muted">Select a block to see its details.</p>
        )}
      </aside>
    </div>
  );
}

function Actions({ node }: { node: MapNode }) {
  if (node.kind === "domain") {
    return (
      <>
        <ButtonLink href={node.href} variant="primary">DNS records</ButtonLink>
        <ButtonLink href={`/projects/${node.project}/domains`}>Manage</ButtonLink>
      </>
    );
  }
  if (node.kind === "data") return <ButtonLink href={node.href} variant="primary">Open database</ButtonLink>;

  const slug = node.project!;
  const failed = node.tone === "err";
  return (
    <>
      {(node.status === "Building" || failed) && node.deploy != null ? (
        <ButtonLink href={`/projects/${slug}/deployments/${node.deploy}`} variant="primary">{failed ? "View failure" : "View build"}</ButtonLink>
      ) : node.status === "Standby" ? (
        <form action={setStandby.bind(null, slug, false)}>
          <Button type="submit" variant="primary">Start</Button>
        </form>
      ) : (
        <form action={redeploy.bind(null, slug)}>
          <Button type="submit" variant="primary">Deploy</Button>
        </form>
      )}
      <ButtonLink href={`/projects?p=${slug}&log=runtime`}>Logs</ButtonLink>
      <ButtonLink href={`/projects/${slug}/settings`}>Settings</ButtonLink>
    </>
  );
}
