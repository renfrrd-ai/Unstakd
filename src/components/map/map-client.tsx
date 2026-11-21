"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// The map is all pointer interaction plus a layout saved in this browser, so it renders on the client only.
export const MapClient = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <Skeleton className="h-[520px] sm:h-[660px]" />,
});
