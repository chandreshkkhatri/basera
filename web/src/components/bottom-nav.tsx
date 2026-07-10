"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutList, Map as MapIcon, MapPin } from "lucide-react";
import { PoiPicker } from "@/components/poi/poi-picker";
import { usePoi } from "@/components/poi/poi-provider";
import { cn } from "@/lib/utils";

const itemClass = (active: boolean) =>
  cn(
    "flex h-full flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium transition-colors",
    active ? "text-brand" : "text-muted-foreground hover:text-foreground",
  );

/**
 * Mobile-only bottom tab bar: Feed, Map, and the POI picker. Feed/Map links
 * carry the current query string so filters survive view switches, matching
 * FilterBar's own toggle.
 */
function BottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { poi, ready } = usePoi();

  const qs = searchParams.toString();
  const href = (base: string) => (qs ? `${base}?${qs}` : base);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <div className="grid h-14 grid-cols-3">
        <Link
          href={href("/")}
          className={itemClass(pathname === "/")}
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <LayoutList className="size-5" />
          Feed
        </Link>
        <Link
          href={href("/map")}
          className={itemClass(pathname.startsWith("/map"))}
          aria-current={pathname.startsWith("/map") ? "page" : undefined}
        >
          <MapIcon className="size-5" />
          Map
        </Link>
        <PoiPicker>
          <button type="button" className={cn(itemClass(false), "w-full")}>
            <MapPin className="size-5" />
            <span className="max-w-24 truncate">
              {ready && poi ? poi.label : "Set point"}
            </span>
          </button>
        </PoiPicker>
      </div>
    </nav>
  );
}

export function BottomNav() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <BottomNavInner />
    </Suspense>
  );
}
