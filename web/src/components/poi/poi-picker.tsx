"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePoi } from "@/components/poi/poi-provider";

/**
 * Sets the user's point of interest (e.g. their office). v1 is geocode-free:
 * paste "lat, lng". Persisted to localStorage via PoiProvider; listings can
 * then show distance chips and be sorted by distance.
 */
export function PoiPicker() {
  const { poi, ready, setPoi, clearPoi } = usePoi();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const m = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) {
      setError('Enter coordinates as "lat, lng"');
      return;
    }
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError("Coordinates out of range");
      return;
    }
    setPoi({ lat, lng, label: label.trim() || "My point" });
    setError(null);
    setText("");
    setLabel("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <MapPin className="size-3.5" />
          {ready && poi ? poi.label : "Set your point"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Your point of interest</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Used to show and sort by distance (e.g. your office). Paste
              coordinates like <code>18.59, 73.74</code>.
            </p>
          </div>

          {ready && poi && (
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{poi.label}</span>{" "}
                <span className="text-muted-foreground">
                  {poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}
                </span>
              </span>
              <button
                type="button"
                onClick={clearPoi}
                aria-label="Clear point"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Input
              placeholder="Label (optional), e.g. Office"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-8"
            />
            <Input
              placeholder="lat, lng"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="h-8"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button size="sm" onClick={submit}>
              Save point
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
