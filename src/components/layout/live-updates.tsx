"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the current page's server data when the worker (or a webhook) changes something,
// so statuses move on their own. Changes that land while the tab is hidden refresh once on return.
export function LiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let missed = false;
    const refresh = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") {
        missed = true;
        return;
      }
      // Deploy steps can land in quick succession; coalesce them into one refresh.
      timer = setTimeout(() => router.refresh(), 300);
    };

    const es = new EventSource("/api/events");
    es.addEventListener("change", refresh);
    // After a dropped connection, catch up on anything that changed meanwhile.
    let dropped = false;
    es.onerror = () => {
      dropped = true;
    };
    es.onopen = () => {
      if (dropped) refresh();
      dropped = false;
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && missed) {
        missed = false;
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      es.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
