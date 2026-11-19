"use client";

import { useEffect, useState } from "react";
import { clock } from "@/lib/format";

// Ticks every second from `since` (ISO string) so build timers stay live without refetching.
export function Elapsed({ since }: { since: string }) {
  const start = new Date(since).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{now === null ? "--:--" : clock(now - start)}</span>;
}
