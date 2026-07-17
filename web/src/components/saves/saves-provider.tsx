"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "basera:saves";

type SavesContext = {
  savedIds: ReadonlySet<number>;
  /** false until localStorage has been read (avoids hydration mismatch). */
  ready: boolean;
  isSaved: (id: number) => boolean;
  toggleSave: (id: number) => void;
};

const Ctx = createContext<SavesContext | null>(null);

/** Client-side shortlist, same localStorage pattern as PoiProvider. */
export function SavesProvider({ children }: { children: React.ReactNode }) {
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            setSavedIds(new Set(parsed.filter((v) => Number.isInteger(v))));
          }
        }
      } catch {
        // ignore corrupt storage
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const toggleSave = useCallback((id: number) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable (private mode); keep in-memory value
      }
      return next;
    });
  }, []);

  const isSaved = useCallback((id: number) => savedIds.has(id), [savedIds]);

  const value = useMemo(
    () => ({ savedIds, ready, isSaved, toggleSave }),
    [savedIds, ready, isSaved, toggleSave],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSaves(): SavesContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSaves must be used within a SavesProvider");
  return ctx;
}
