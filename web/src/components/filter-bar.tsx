"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { List, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { usePoi } from "@/components/poi/poi-provider";
import { cn } from "@/lib/utils";
import {
  BHK_BUCKETS,
  BHK_LABELS,
  FURNISHINGS,
  GENDERS,
  POSTED_WITHIN,
} from "@/lib/filters";
import { SOURCE_KEYS, sourceMeta } from "@/lib/sources";
import { furnishingLabel, genderLabel } from "@/lib/normalize";

const POSTED_LABELS: Record<string, string> = {
  "1d": "Last 24h",
  "3d": "Last 3 days",
  "7d": "Last week",
  "30d": "Last 30 days",
};

const SORT_LABELS: Record<string, string> = {
  newest: "Newest",
  rent_asc: "Rent: low to high",
  rent_desc: "Rent: high to low",
  distance: "Nearest to my point",
};

export function FilterBar({ cities }: { cities: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { poi } = usePoi();

  const get = (k: string) => searchParams.get(k) ?? "";
  const getList = (k: string) =>
    (searchParams.get(k) ?? "").split(",").filter(Boolean);

  // Local state for debounced rent inputs.
  const [rentMin, setRentMin] = useState(get("rentMin"));
  const [rentMax, setRentMax] = useState(get("rentMax"));
  useEffect(() => setRentMin(get("rentMin")), [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setRentMax(get("rentMax")), [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback(
    (mutate: (q: URLSearchParams) => void) => {
      const q = new URLSearchParams(searchParams.toString());
      mutate(q);
      q.delete("page"); // any filter change resets pagination
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setParam = (key: string, value: string) =>
    commit((q) => (value ? q.set(key, value) : q.delete(key)));

  const toggleInList = (key: string, value: string) =>
    commit((q) => {
      const cur = new Set((q.get(key) ?? "").split(",").filter(Boolean));
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      if (cur.size) q.set(key, [...cur].join(","));
      else q.delete(key);
    });

  // Debounce rent inputs into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (rentMin !== get("rentMin")) setParam("rentMin", rentMin);
    }, 400);
    return () => clearTimeout(t);
  }, [rentMin]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => {
      if (rentMax !== get("rentMax")) setParam("rentMax", rentMax);
    }, 400);
    return () => clearTimeout(t);
  }, [rentMax]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSort = (value: string) =>
    commit((q) => {
      if (value === "distance") {
        if (!poi) return;
        q.set("sort", "distance");
        q.set("poiLat", String(poi.lat));
        q.set("poiLng", String(poi.lng));
      } else {
        q.delete("poiLat");
        q.delete("poiLng");
        if (value === "newest") q.delete("sort");
        else q.set("sort", value);
      }
    });

  const activeCount = [
    "city",
    "rentMin",
    "rentMax",
    "bhk",
    "gender",
    "furnishing",
    "source",
    "postedWithin",
  ].filter((k) => searchParams.get(k)).length;

  const otherView =
    pathname === "/map"
      ? { href: `/?${searchParams.toString()}`, label: "List", Icon: List }
      : { href: `/map?${searchParams.toString()}`, label: "Map", Icon: MapIcon };

  const currentSort = get("sort") || "newest";

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "hover:bg-muted",
    );

  const secondaryFilters = (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Source</p>
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_KEYS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleInList("source", s)}
              className={chip(getList("source").includes(s))}
            >
              {sourceMeta(s).label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">BHK</p>
        <div className="flex flex-wrap gap-1.5">
          {BHK_BUCKETS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => toggleInList("bhk", b)}
              className={chip(getList("bhk").includes(b))}
            >
              {BHK_LABELS[b]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Tenant preference
        </p>
        <div className="flex flex-wrap gap-1.5">
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleInList("gender", g)}
              className={chip(getList("gender").includes(g))}
            >
              {genderLabel(g)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Furnishing
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FURNISHINGS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => toggleInList("furnishing", f)}
              className={chip(getList("furnishing").includes(f))}
            >
              {furnishingLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Posted within
        </p>
        <div className="flex flex-wrap gap-1.5">
          {POSTED_WITHIN.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() =>
                setParam("postedWithin", get("postedWithin") === p ? "" : p)
              }
              className={chip(get("postedWithin") === p)}
            >
              {POSTED_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={get("city") || "__all"}
          onValueChange={(v) => setParam("city", v === "__all" ? "" : v)}
        >
          <SelectTrigger className="w-[150px]" size="sm">
            <SelectValue placeholder="City" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All cities</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          inputMode="numeric"
          placeholder="Min ₹"
          value={rentMin}
          onChange={(e) => setRentMin(e.target.value)}
          className="h-8 w-[100px]"
        />
        <Input
          type="number"
          inputMode="numeric"
          placeholder="Max ₹"
          value={rentMax}
          onChange={(e) => setRentMax(e.target.value)}
          className="h-8 w-[100px]"
        />

        <Select value={currentSort} onValueChange={setSort}>
          <SelectTrigger className="w-[190px]" size="sm">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{SORT_LABELS.newest}</SelectItem>
            <SelectItem value="rent_asc">{SORT_LABELS.rent_asc}</SelectItem>
            <SelectItem value="rent_desc">{SORT_LABELS.rent_desc}</SelectItem>
            <SelectItem value="distance" disabled={!poi}>
              {SORT_LABELS.distance}
              {!poi ? " (set a point)" : ""}
            </SelectItem>
          </SelectContent>
        </Select>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="size-3.5" />
              Filters
              {activeCount > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto px-4 pb-6">{secondaryFilters}</div>
          </SheetContent>
        </Sheet>

        {activeCount > 0 && (
          <Link
            href={pathname}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            <X className="size-3.5" />
            Clear
          </Link>
        )}

        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href={otherView.href} scroll={false}>
            <otherView.Icon className="size-3.5" />
            {otherView.label}
          </Link>
        </Button>
      </div>
    </div>
  );
}
