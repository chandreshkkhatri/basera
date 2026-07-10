"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePoi, type Poi } from "@/components/poi/poi-provider";

const PoiMapPickerInner = dynamic(
  () => import("@/components/poi/poi-map-picker-inner"),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-muted" />,
  },
);

// Pune — a reasonable default focus before the user has picked anything.
const DEFAULT_CENTER = { lat: 18.5204, lng: 73.8567 };

type GeocodeResult = { label: string; display: string; lat: number; lng: number };

/**
 * Sets the user's point of interest. Three ways in: search a place name
 * (geocoded via /api/geocode), use device geolocation, or tap the map. The
 * chosen point is persisted via PoiProvider; listings then show distance
 * chips and can be sorted by distance.
 *
 * Pass `children` to replace the default trigger (e.g. the bottom-nav tab).
 */
export function PoiPicker({ children }: { children?: ReactNode }) {
  const { poi, ready, setPoi, clearPoi } = usePoi();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm">
            <MapPin className="size-3.5" />
            {ready && poi ? poi.label : "Set your point"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        {/* Remounts on each open (Radix mounts content lazily), so the body's
            state initializes from the current POI without a sync effect. */}
        <PoiPickerBody
          poi={ready ? poi : null}
          onSave={(next) => {
            setPoi(next);
            setOpen(false);
          }}
          onClear={() => {
            clearPoi();
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function PoiPickerBody({
  poi,
  onSave,
  onClear,
}: {
  poi: Poi | null;
  onSave: (poi: Poi) => void;
  onClear: () => void;
}) {
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(
    poi ? { lat: poi.lat, lng: poi.lng } : null,
  );
  const [label, setLabel] = useState(poi?.label ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The query value we just set from picking a result — don't re-search it,
  // which would reopen the dropdown on top of the controls below.
  const pickedQuery = useRef<string | null>(null);

  // Debounced place search. All state writes happen inside the timer callback
  // (never synchronously in the effect body).
  useEffect(() => {
    const q = query.trim();
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      if (q.length < 3 || q === pickedQuery.current) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as { results: GeocodeResult[] };
        setResults(data.results ?? []);
      } catch {
        if (!ctrl.signal.aborted) setError("Search failed. Try again.");
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const reverseLabel = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      if (!res.ok) return;
      const data = (await res.json()) as { label?: string };
      if (data.label) setLabel(data.label);
    } catch {
      // keep whatever label is there
    }
  }, []);

  const pickResult = (r: GeocodeResult) => {
    setPending({ lat: r.lat, lng: r.lng });
    setLabel(r.label);
    setResults([]);
    pickedQuery.current = r.label;
    setQuery(r.label);
  };

  const onMapPick = useCallback(
    (lat: number, lng: number) => {
      setPending({ lat, lng });
      reverseLabel(lat, lng);
    },
    [reverseLabel],
  );

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation isn't available in this browser.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPending({ lat: latitude, lng: longitude });
        setLabel("My location");
        reverseLabel(latitude, longitude);
        setLocating(false);
      },
      () => {
        setError("Couldn't get your location — check location permissions.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const save = () => {
    if (!pending) return;
    onSave({
      lat: pending.lat,
      lng: pending.lng,
      label: label.trim() || "My point",
    });
  };

  const center = pending ?? DEFAULT_CENTER;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Set your point</DialogTitle>
        <DialogDescription>
          Search a place, use your location, or tap the map. Listings show and
          sort by distance from here.
        </DialogDescription>
      </DialogHeader>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a locality, landmark, area…"
          className="h-9 pl-8"
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover shadow-lg">
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lng},${i}`}>
                <button
                  type="button"
                  onClick={() => pickResult(r)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block font-medium">{r.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.display}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={useMyLocation}
          disabled={locating}
        >
          <LocateFixed className="size-3.5" />
          {locating ? "Locating…" : "Use my location"}
        </Button>
        {searching && (
          <span className="text-xs text-muted-foreground">Searching…</span>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="h-56 w-full overflow-hidden rounded-lg border">
        <PoiMapPickerInner
          lat={center.lat}
          lng={center.lng}
          showMarker={pending != null}
          onPick={onMapPick}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Office)"
          className="h-9"
        />
        {pending && (
          <p className="text-xs text-muted-foreground">
            {pending.lat.toFixed(4)}, {pending.lng.toFixed(4)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {poi ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="size-3.5" />
            Clear point
          </Button>
        ) : (
          <span />
        )}
        <Button size="sm" onClick={save} disabled={!pending}>
          Save point
        </Button>
      </div>
    </>
  );
}
