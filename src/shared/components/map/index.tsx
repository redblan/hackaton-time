"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/shared/components/ui/skeleton";

export type { MapPoint } from "./map-view";

/** Карта без SSR (Leaflet работает только в браузере). Используйте этот компонент. */
export const MapViewLazy = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => <Skeleton className="h-[600px] w-full rounded-xl" />,
});
