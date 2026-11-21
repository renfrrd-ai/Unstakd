"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bytes } from "@/lib/format";

export type Point = { t: number; v: number };
type Unit = "percent" | "bytes";

const H = 168;
const M = { top: 14, right: 64, bottom: 24, left: 52 };
const GAP_MS = 3 * 60_000;

function fmt(v: number, unit: Unit) {
  if (v === 0) return unit === "bytes" ? "0" : "0%";
  if (unit === "bytes") return bytes(v);
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
}

function niceMax(v: number, unit: Unit) {
  if (unit === "percent") return v <= 10 ? 10 : v <= 25 ? 25 : v <= 50 ? 50 : v <= 100 ? 100 : Math.ceil(v / 100) * 100;
  const mb = v / 1024 / 1024;
  const steps = [64, 128, 256, 512, 1024, 2048, 4096, 8192];
  return (steps.find((s) => s >= mb) ?? Math.ceil(mb / 1024) * 1024) * 1024 * 1024;
}

const time = (t: number) => new Date(t).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });

// Single-series time chart: 2px line over a 10% wash, end value labelled, crosshair + tooltip on hover/keys.
export function LineChart({ title, points, unit, reference, now, windowMs = 24 * 3600_000 }: { title: string; points: Point[]; unit: Unit; reference?: { value: number; label: string }; now: number; windowMs?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const start = now - windowMs;
  const max = niceMax(Math.max(reference?.value ?? 0, ...points.map((p) => p.v), unit === "percent" ? 1 : 1), unit);
  const iw = width - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (t: number) => M.left + ((t - start) / windowMs) * iw;
  const y = (v: number) => M.top + ih - (Math.min(v, max) / max) * ih;

  // Break the line where samples are missing so outages read as gaps, not slopes.
  const segments = useMemo(() => {
    const out: Point[][] = [];
    for (const p of points) {
      const last = out.at(-1);
      if (!last || p.t - last[last.length - 1].t > GAP_MS) out.push([p]);
      else last.push(p);
    }
    return out;
  }, [points]);

  const line = (seg: Point[]) => seg.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = (seg: Point[]) => `${line(seg)}L${x(seg[seg.length - 1].t).toFixed(1)},${y(0)}L${x(seg[0].t).toFixed(1)},${y(0)}Z`;
  const latest = points.at(-1);
  const hover = active != null ? points[active] : null;
  const ticks = [0, max / 2, max];
  // Fewer time labels when narrow, so they never collide.
  const xTicks = (iw < 360 ? [0, 12, 24] : [0, 6, 12, 18, 24]).map((h) => start + (h / 24) * windowMs);

  const nearest = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const t = start + ((clientX - rect.left - M.left) / iw) * windowMs;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
    return points.length ? best : null;
  };

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2 rounded-[18px] border border-border bg-panel p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted">{title}</span>
        <span className="text-[13px] text-muted">last 24 hours</span>
      </figcaption>
      <div
        ref={box}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-accent"
        tabIndex={points.length ? 0 : -1}
        role="img"
        aria-label={`${title}, last 24 hours${latest ? `, now ${fmt(latest.v, unit)}` : ", no data"}`}
        onPointerMove={(e) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (!points.length) return;
          if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? points.length - 1) - 1));
          else if (e.key === "ArrowRight") setActive((a) => Math.min(points.length - 1, (a ?? points.length - 1) + 1));
          else return;
          e.preventDefault();
        }}
      >
        <svg width={width} height={H} className="block" aria-hidden="true">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={M.left + iw} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
              <text x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-dim font-mono text-[11px] tabular-nums">
                {fmt(v, unit)}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={t} x={x(t)} y={H - 6} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="fill-dim font-mono text-[11px] tabular-nums">
              {i === xTicks.length - 1 ? "now" : time(t)}
            </text>
          ))}
          {reference && reference.value <= max && (
            <g>
              <line x1={M.left} x2={M.left + iw} y1={y(reference.value)} y2={y(reference.value)} className="stroke-border-strong" strokeWidth={1} />
              <text x={M.left + iw - 4} y={y(reference.value) - 6} textAnchor="end" className="fill-muted text-[11px]">
                {reference.label}
              </text>
            </g>
          )}
          {segments.map((seg, i) => (
            <g key={i}>
              {seg.length > 1 && <path d={area(seg)} className="fill-chart" opacity={0.1} />}
              <path d={line(seg)} fill="none" className="stroke-chart" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {latest && !hover && (
            <g>
              <circle cx={x(latest.t)} cy={y(latest.v)} r={4} className="fill-chart stroke-panel" strokeWidth={2} />
              <text x={x(latest.t) + 8} y={y(latest.v)} dy="0.32em" className="fill-text text-[12px] font-semibold tabular-nums">
                {fmt(latest.v, unit)}
              </text>
            </g>
          )}
          {hover && (
            <g>
              <line x1={x(hover.t)} x2={x(hover.t)} y1={M.top} y2={M.top + ih} className="stroke-muted" strokeWidth={1} />
              <circle cx={x(hover.t)} cy={y(hover.v)} r={4} className="fill-chart stroke-panel" strokeWidth={2} />
            </g>
          )}
          {!points.length && (
            <text x={M.left + iw / 2} y={M.top + ih / 2} textAnchor="middle" className="fill-muted text-[13px]">
              No samples yet; collected every minute while the app runs.
            </text>
          )}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute top-1 rounded-[10px] border border-border bg-panel px-2.5 py-1.5 shadow-soft"
            style={{ left: Math.min(Math.max(x(hover.t) - 60, 0), width - 130) }}
          >
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-0.5 w-3 rounded bg-chart" />
              <span className="font-semibold tabular-nums">{fmt(hover.v, unit)}</span>
            </div>
            <div className="font-mono text-[11px] text-muted">{time(hover.t)}</div>
          </div>
        )}
      </div>
      <DataTable points={points} unit={unit} title={title} />
    </figure>
  );
}

// Hourly averages, so the table view stays short but nothing is hover-only.
function DataTable({ points, unit, title }: { points: Point[]; unit: Unit; title: string }) {
  const hours = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const p of points) {
      const h = Math.floor(p.t / 3600_000) * 3600_000;
      m.set(h, [...(m.get(h) ?? []), p.v]);
    }
    return [...m].map(([h, vs]) => ({ h, avg: vs.reduce((a, b) => a + b, 0) / vs.length, peak: Math.max(...vs) })).reverse();
  }, [points]);
  if (!hours.length) return null;
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer text-muted hover:text-text">Data table</summary>
      <table className="mt-2 w-full border-collapse">
        <caption className="sr-only">{title}, hourly</caption>
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 font-medium">Hour</th>
            <th className="py-1 text-right font-medium">Average</th>
            <th className="py-1 text-right font-medium">Peak</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((r) => (
            <tr key={r.h} className="border-t border-border">
              <td className="py-1 font-mono tabular-nums">{time(r.h)}</td>
              <td className="py-1 text-right tabular-nums">{fmt(r.avg, unit)}</td>
              <td className="py-1 text-right tabular-nums">{fmt(r.peak, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
