"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapPinned } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { City } from "@/db/schema";

const STORAGE_KEY = "basera:city";

/**
 * Header city picker. The selected city (slug) lives in the URL `city` param —
 * the server resolves it and scopes every listing query. We also persist the
 * choice to localStorage so a fresh visit (no param) lands on the last city.
 * Changing the city keeps other filters but resets pagination.
 */
export function CitySelector({ cities }: { cities: City[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The active city mirrors the server's resolveCity(): the URL slug if it's a
  // valid enabled city, else the first enabled city.
  const urlSlug = searchParams.get("city");
  const activeSlug =
    (urlSlug && cities.find((c) => c.slug === urlSlug)?.slug) ||
    cities[0]?.slug ||
    "";

  // Persist the active city; on a URL with no explicit city, restore the stored
  // one if it's still enabled and differs from the server default.
  useEffect(() => {
    const urlCity = searchParams.get("city");
    if (urlCity) {
      try {
        localStorage.setItem(STORAGE_KEY, urlCity);
      } catch {
        // ignore
      }
      return;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored !== activeSlug && cities.some((c) => c.slug === stored)) {
        router.replace(`${pathname}?city=${stored}`, { scroll: false });
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, activeSlug]);

  const onChange = (slug: string) => {
    // Switching cities changes the whole result set — start filters fresh,
    // keeping only the POI (which is city-independent).
    const q = new URLSearchParams();
    q.set("city", slug);
    const poiLat = searchParams.get("poiLat");
    const poiLng = searchParams.get("poiLng");
    if (poiLat && poiLng) {
      q.set("poiLat", poiLat);
      q.set("poiLng", poiLng);
    }
    try {
      localStorage.setItem(STORAGE_KEY, slug);
    } catch {
      // ignore
    }
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  };

  if (cities.length === 0) return null;

  return (
    <Select value={activeSlug} onValueChange={onChange}>
      <SelectTrigger size="sm" className="min-w-[130px]">
        <MapPinned className="size-3.5" />
        <SelectValue placeholder="City" />
      </SelectTrigger>
      <SelectContent>
        {cities.map((c) => (
          <SelectItem key={c.slug} value={c.slug}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
