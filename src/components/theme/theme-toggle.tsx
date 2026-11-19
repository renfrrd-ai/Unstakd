"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { THEME_STORAGE_KEY, type Theme } from "./theme";

const listeners = new Set<() => void>();
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mq = media();
  mq.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", onChange);
  };
}

function getTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return media().matches ? "dark" : "light";
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
  listeners.forEach((l) => l());
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark" as Theme);
  const target: Theme = theme === "dark" ? "light" : "dark";
  const label = target === "light" ? "Light" : "Dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(target)}
      aria-pressed={theme === "light"}
      aria-label={`Switch to ${target} mode`}
      className={cn(
        "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-border-strong bg-panel px-3.5 text-[13px] font-semibold text-text hover:bg-panel-2",
        className,
      )}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      <span>{label}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
