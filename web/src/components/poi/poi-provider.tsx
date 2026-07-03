"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Poi = { lat: number; lng: number; label: string };

const STORAGE_KEY = "basera:poi";

type PoiContext = {
  poi: Poi | null;
  /** null until we've read localStorage, to avoid SSR/CSR hydration mismatch. */
  ready: boolean;
  setPoi: (poi: Poi) => void;
  clearPoi: () => void;
};

const Ctx = createContext<PoiContext | null>(null);

export function PoiProvider({ children }: { children: React.ReactNode }) {
  const [poi, setPoiState] = useState<Poi | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Poi;
        if (
          typeof parsed?.lat === "number" &&
          typeof parsed?.lng === "number"
        ) {
          setPoiState(parsed);
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setReady(true);
  }, []);

  const setPoi = useCallback((next: Poi) => {
    setPoiState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage may be unavailable (private mode); keep in-memory value
    }
  }, []);

  const clearPoi = useCallback(() => {
    setPoiState(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({ poi, ready, setPoi, clearPoi }),
    [poi, ready, setPoi, clearPoi],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePoi(): PoiContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePoi must be used within a PoiProvider");
  return ctx;
}
