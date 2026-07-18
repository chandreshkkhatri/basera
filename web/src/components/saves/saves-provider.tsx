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
  arrayRemove,
  arrayUnion,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-provider";
import { firebaseEnabled, getFirebase } from "@/lib/firebase";

const STORAGE_KEY = "basera:saves";

type SavesContext = {
  savedIds: ReadonlySet<number>;
  ready: boolean;
  isSaved: (id: number) => boolean;
  toggleSave: (id: number) => void;
};

const Ctx = createContext<SavesContext | null>(null);

function readLocal(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => Number.isInteger(v)) : [];
  } catch {
    return [];
  }
}

function writeLocal(ids: number[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable
  }
}

/**
 * Shortlist store. Signed-in (Firebase configured): a Firestore doc
 * `saves/{uid}`, synced across devices. Otherwise: localStorage, exactly as
 * before — so the app is unchanged until Firebase is configured, and a signed-
 * out user's legacy local saves migrate up to Firestore on first sign-in.
 */
export function SavesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [ready, setReady] = useState(false);

  const cloud = firebaseEnabled && !!user;

  // Local hydration — owns the state whenever we're not on the cloud path.
  // Deferred (like PoiProvider) so it doesn't run synchronously in the effect.
  useEffect(() => {
    if (cloud) return;
    const t = window.setTimeout(() => {
      setSavedIds(new Set(readLocal()));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, [cloud]);

  // Firestore subscription + one-time local->cloud migration on sign-in.
  useEffect(() => {
    if (!cloud || !user) return;
    const fb = getFirebase();
    if (!fb) return;
    const ref = doc(fb.db, "saves", user.uid);

    const local = readLocal();
    if (local.length) {
      setDoc(ref, { ids: arrayUnion(...local) }, { merge: true })
        .then(() => writeLocal([]))
        .catch(() => {});
    }

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const ids = (snap.data()?.ids ?? []) as number[];
        setSavedIds(new Set(ids.filter((v) => Number.isInteger(v))));
        setReady(true);
      },
      () => setReady(true),
    );
    return unsub;
  }, [cloud, user]);

  const toggleSave = useCallback(
    (id: number) => {
      const has = savedIds.has(id);
      const next = new Set(savedIds);
      if (has) next.delete(id);
      else next.add(id);
      setSavedIds(next); // optimistic

      if (cloud && user) {
        const fb = getFirebase();
        if (fb) {
          void setDoc(
            doc(fb.db, "saves", user.uid),
            { ids: has ? arrayRemove(id) : arrayUnion(id) },
            { merge: true },
          ).catch(() => {});
        }
      } else {
        writeLocal([...next]);
      }
    },
    [savedIds, cloud, user],
  );

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
