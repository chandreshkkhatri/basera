"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-provider";
import { firebaseEnabled, getFirebase } from "@/lib/firebase";

export type Poi = { lat: number; lng: number; label: string };

const STORAGE_KEY = "basera:poi";

type PoiContext = {
  poi: Poi | null;
  /** null until we've read localStorage or Firestore, to avoid SSR/CSR hydration mismatch. */
  ready: boolean;
  setPoi: (poi: Poi) => void;
  clearPoi: () => void;
};

const Ctx = createContext<PoiContext | null>(null);

function readLocalPoi(): Poi | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Poi;
    if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") {
      return parsed;
    }
  } catch {
    // ignore corrupt storage
  }
  return null;
}

function writeLocalPoi(poi: Poi | null) {
  try {
    if (poi) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(poi));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage unavailable
  }
}

export function PoiProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [poi, setPoiState] = useState<Poi | null>(null);
  const [ready, setReady] = useState(false);

  const cloud = firebaseEnabled && !!user;

  // Local hydration — active when NOT signed into cloud.
  useEffect(() => {
    if (cloud) return;
    const id = window.setTimeout(() => {
      const local = readLocalPoi();
      setPoiState(local);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [cloud]);

  // Firestore subscription + legacy local->cloud migration on sign-in.
  useEffect(() => {
    if (!cloud || !user) return;
    const fb = getFirebase();
    if (!fb) return;
    const ref = doc(fb.db, "locations", user.uid);

    const localPoi = readLocalPoi();

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        if (snap.exists() && data?.poi !== undefined) {
          const remotePoi = (data.poi ?? null) as Poi | null;
          setPoiState(remotePoi);
          writeLocalPoi(remotePoi);
        } else if (localPoi) {
          // Migrate local POI to Firestore on first sign-in
          void setDoc(
            ref,
            { poi: localPoi, updatedAt: new Date().toISOString() },
            { merge: true },
          ).catch(() => {});
          setPoiState(localPoi);
        } else {
          setPoiState(null);
        }
        setReady(true);
      },
      () => setReady(true),
    );
    return unsub;
  }, [cloud, user]);

  const setPoi = useCallback(
    (next: Poi) => {
      setPoiState(next);
      writeLocalPoi(next);

      if (cloud && user) {
        const fb = getFirebase();
        if (fb) {
          const ref = doc(fb.db, "locations", user.uid);
          void setDoc(
            ref,
            { poi: next, updatedAt: new Date().toISOString() },
            { merge: true },
          ).catch(() => {});
        }
      }
    },
    [cloud, user],
  );

  const clearPoi = useCallback(() => {
    setPoiState(null);
    writeLocalPoi(null);

    if (cloud && user) {
      const fb = getFirebase();
      if (fb) {
        const ref = doc(fb.db, "locations", user.uid);
        void updateDoc(ref, {
          poi: deleteField(),
          updatedAt: new Date().toISOString(),
        }).catch(() => {
          void setDoc(
            ref,
            { poi: deleteField(), updatedAt: new Date().toISOString() },
            { merge: true },
          ).catch(() => {});
        });
      }
    }
  }, [cloud, user]);

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

