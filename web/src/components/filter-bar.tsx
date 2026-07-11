"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  List,
  Map as MapIcon,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
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
  DISTANCE_SORT_AGE_PENALTY_KM_PER_DAY,
  FURNISHINGS,
  GENDERS,
  POSTED_WITHIN,
} from "@/lib/filters";
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

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { poi } = usePoi();

  const get = (k: string) => searchParams.get(k) ?? "";
  const getList = (k: string) =>
    (searchParams.get(k) ?? "").split(",").filter(Boolean);

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
        // "newest" is set explicitly (not omitted) so the default-to-distance
        // effect below can tell "chose newest" from "no choice yet".
        q.set("sort", value);
      }
    });

  // Default the feed to distance sort once the user has a saved point: when a
  // POI exists and no sort has been chosen yet, apply distance. Picking any
  // sort (incl. "newest") writes an explicit param, which stops this firing.
  useEffect(() => {
    if (poi && !searchParams.get("sort") && !searchParams.get("poiLat")) {
      commit((q) => {
        q.set("sort", "distance");
        q.set("poiLat", String(poi.lat));
        q.set("poiLng", String(poi.lng));
      });
    }
  }, [poi, searchParams, commit]);

  const activeCount = [
    "q",
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

  // With a POI but no explicit sort, the effect above is about to apply
  // distance — reflect that in the selector immediately to avoid a flash.
  const currentSort = get("sort") || (poi ? "distance" : "newest");
  const currentLayout = get("layout") === "cards" ? "cards" : "list";

  const secondaryFilters = (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">BHK</p>
        <div className="flex flex-wrap gap-1.5">
          {BHK_BUCKETS.map((b) => (
            <Chip
              key={b}
              active={getList("bhk").includes(b)}
              onClick={() => toggleInList("bhk", b)}
            >
              {BHK_LABELS[b]}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Tenant preference
        </p>
        <div className="flex flex-wrap gap-1.5">
          {GENDERS.map((g) => (
            <Chip
              key={g}
              active={getList("gender").includes(g)}
              onClick={() => toggleInList("gender", g)}
            >
              {genderLabel(g)}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Furnishing
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FURNISHINGS.map((f) => (
            <Chip
              key={f}
              active={getList("furnishing").includes(f)}
              onClick={() => toggleInList("furnishing", f)}
            >
              {furnishingLabel(f)}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Posted within
        </p>
        <div className="flex flex-wrap gap-1.5">
          {POSTED_WITHIN.map((p) => (
            <Chip
              key={p}
              active={get("postedWithin") === p}
              onClick={() =>
                setParam("postedWithin", get("postedWithin") === p ? "" : p)
              }
            >
              {POSTED_LABELS[p]}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput key={`q:${get("q")}`} value={get("q")} setParam={setParam} />

        <RentInputs
          key={`${get("rentMin")}:${get("rentMax")}`}
          rentMinValue={get("rentMin")}
          rentMaxValue={get("rentMax")}
          setParam={setParam}
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

        <div className="ml-auto flex items-center gap-1.5">
          {pathname === "/" && (
            <div
              role="group"
              aria-label="Result layout"
              className="flex rounded-lg border p-0.5"
            >
              <LayoutToggleButton
                active={currentLayout === "list"}
                onClick={() => setParam("layout", "")}
                label="List view"
              >
                <Rows3 className="size-3.5" />
              </LayoutToggleButton>
              <LayoutToggleButton
                active={currentLayout === "cards"}
                onClick={() => setParam("layout", "cards")}
                label="Card view"
              >
                <LayoutGrid className="size-3.5" />
              </LayoutToggleButton>
            </div>
          )}
          {/* Mobile switches feed/map views via the BottomNav instead. */}
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href={otherView.href} scroll={false}>
              <otherView.Icon className="size-3.5" />
              {otherView.label}
            </Link>
          </Button>
        </div>
      </div>
      {/* Mirrors the server: the age penalty applies whenever the distance
          sort is usable (POI present). */}
      {currentSort === "distance" && get("poiLat") && get("poiLng") && (
        <div className="text-xs text-muted-foreground italic">
          * Older posts rank lower — each day of age counts like an extra{" "}
          {DISTANCE_SORT_AGE_PENALTY_KM_PER_DAY} km of distance.
        </div>
      )}
    </div>
  );
}

function LayoutToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-6 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SearchInput({
  value,
  setParam,
}: {
  value: string;
  setParam: (key: string, value: string) => void;
}) {
  const [q, setQ] = useState(value);

  // Debounce the locality search into the URL (same pattern as RentInputs).
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== value) setParam("q", q.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [q, value, setParam]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search locality…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-8 w-40 pl-8 sm:w-48"
        aria-label="Search locality"
      />
    </div>
  );
}

function RentInputs({
  rentMinValue,
  rentMaxValue,
  setParam,
}: {
  rentMinValue: string;
  rentMaxValue: string;
  setParam: (key: string, value: string) => void;
}) {
  const [rentMin, setRentMin] = useState(rentMinValue);
  const [rentMax, setRentMax] = useState(rentMaxValue);

  // Debounce rent inputs into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (rentMin !== rentMinValue) setParam("rentMin", rentMin);
    }, 400);
    return () => clearTimeout(t);
  }, [rentMin, rentMinValue, setParam]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (rentMax !== rentMaxValue) setParam("rentMax", rentMax);
    }, 400);
    return () => clearTimeout(t);
  }, [rentMax, rentMaxValue, setParam]);

  return (
    <>
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
    </>
  );
}
