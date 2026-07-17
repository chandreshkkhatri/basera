"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  const { poi, ready: poiReady } = usePoi();

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

  // Keep the URL's point in lockstep with the user's saved point.
  // 1. No sort chosen yet + a point exists -> default to distance sort.
  // 2. URL carries a DIFFERENT point than the saved one (user moved their
  //    point after sorting) -> update it, else the server sorts and shows
  //    distances to the stale point.
  // 3. Point cleared -> drop the params (and a now-impossible distance sort).
  useEffect(() => {
    if (!poiReady) return;
    const urlLat = searchParams.get("poiLat");
    const urlLng = searchParams.get("poiLng");
    if (poi) {
      if (!searchParams.get("sort") && !urlLat) {
        commit((q) => {
          q.set("sort", "distance");
          q.set("poiLat", String(poi.lat));
          q.set("poiLng", String(poi.lng));
        });
        return;
      }
      // Epsilon compare: the params round-trip through strings, and an exact
      // != would loop the effect against itself.
      const drifted =
        urlLat != null &&
        urlLng != null &&
        (Math.abs(Number(urlLat) - poi.lat) > 1e-6 ||
          Math.abs(Number(urlLng) - poi.lng) > 1e-6);
      if (drifted) {
        commit((q) => {
          q.set("poiLat", String(poi.lat));
          q.set("poiLng", String(poi.lng));
        });
      }
    } else if (urlLat || urlLng) {
      commit((q) => {
        q.delete("poiLat");
        q.delete("poiLng");
        if (q.get("sort") === "distance") q.delete("sort");
      });
    }
  }, [poi, poiReady, searchParams, commit]);

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
        <SearchInput
          key={`q:${get("q")}`}
          value={get("q")}
          city={get("city")}
          setParam={setParam}
        />

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
      <ActiveFilterChips
        get={get}
        getList={getList}
        setParam={setParam}
        toggleInList={toggleInList}
        commit={commit}
      />

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

/** One dismissible chip per applied filter — state stays visible without
 *  opening the Filters sheet. Removal reuses the same commit helpers. */
function ActiveFilterChips({
  get,
  getList,
  setParam,
  toggleInList,
  commit,
}: {
  get: (k: string) => string;
  getList: (k: string) => string[];
  setParam: (key: string, value: string) => void;
  toggleInList: (key: string, value: string) => void;
  commit: (mutate: (q: URLSearchParams) => void) => void;
}) {
  const rupees = (v: string) => `₹${Number(v).toLocaleString("en-IN")}`;
  const chips: { label: string; onRemove: () => void }[] = [];

  if (get("q")) {
    chips.push({ label: `“${get("q")}”`, onRemove: () => setParam("q", "") });
  }
  const rentMin = get("rentMin");
  const rentMax = get("rentMax");
  if (rentMin || rentMax) {
    const label =
      rentMin && rentMax
        ? `${rupees(rentMin)}–${rupees(rentMax)}`
        : rentMin
          ? `≥ ${rupees(rentMin)}`
          : `≤ ${rupees(rentMax)}`;
    chips.push({
      label,
      onRemove: () =>
        commit((q) => {
          q.delete("rentMin");
          q.delete("rentMax");
        }),
    });
  }
  for (const b of getList("bhk")) {
    chips.push({
      label: BHK_LABELS[b as keyof typeof BHK_LABELS] ?? b,
      onRemove: () => toggleInList("bhk", b),
    });
  }
  for (const g of getList("gender")) {
    chips.push({ label: genderLabel(g), onRemove: () => toggleInList("gender", g) });
  }
  for (const f of getList("furnishing")) {
    chips.push({
      label: furnishingLabel(f) ?? f,
      onRemove: () => toggleInList("furnishing", f),
    });
  }
  if (get("postedWithin")) {
    chips.push({
      label: POSTED_LABELS[get("postedWithin")] ?? get("postedWithin"),
      onRemove: () => setParam("postedWithin", ""),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div data-testid="active-filters" className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.onRemove}
          title="Remove filter"
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1.5 pl-2.5 text-xs text-foreground transition-colors hover:bg-muted"
        >
          {c.label}
          <X className="size-3 text-muted-foreground" />
        </button>
      ))}
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

type LocationSuggestion = { location: string; count: number };

function SearchInput({
  value,
  city,
  setParam,
}: {
  value: string;
  city: string;
  setParam: (key: string, value: string) => void;
}) {
  const [q, setQ] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // The value we just picked from the dropdown — don't re-suggest it.
  const picked = useRef<string | null>(null);

  // Debounce the locality search into the URL (same pattern as RentInputs).
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== value) setParam("q", q.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [q, value, setParam]);

  // Debounced autocomplete: localities that actually have listings in the
  // current city, so every suggestion is guaranteed to yield results.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || term === picked.current) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: term });
        if (city) params.set("city", city);
        const res = await fetch(`/api/locations?${params}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: LocationSuggestion[] };
        setSuggestions(data.suggestions ?? []);
        setOpen((data.suggestions ?? []).length > 0);
        setActive(-1);
      } catch {
        // aborted or offline — suggestions are progressive enhancement
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, city]);

  const pick = (loc: string) => {
    picked.current = loc;
    setOpen(false);
    setQ(loc);
    setParam("q", loc);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active].location);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search locality…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="h-8 w-40 pl-8 sm:w-48"
        aria-label="Search locality"
      />
      {open && (
        <ul
          data-testid="location-suggestions"
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-64 overflow-auto rounded-lg border bg-popover py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.location} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown fires before the input's blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s.location);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                  i === active ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span className="truncate">{s.location}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {s.count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
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
        className="h-8 w-25"
      />
      <Input
        type="number"
        inputMode="numeric"
        placeholder="Max ₹"
        value={rentMax}
        onChange={(e) => setRentMax(e.target.value)}
        className="h-8 w-25"
      />
    </>
  );
}
