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
  updateDoc,
  deleteField,
} from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-provider";
import { firebaseEnabled, getFirebase } from "@/lib/firebase";

const STORAGE_KEY = "basera:saves";

export type ShortlistStatus =
  | "shortlisted"
  | "contacted"
  | "scheduled"
  | "visited"
  | "applied"
  | "booked"
  | "declined";

export interface ShortlistItemMetadata {
  status: ShortlistStatus;
  notes?: string;
  visitDate?: string;
  contactedAt?: string;
  visitedAt?: string;
  bookedAt?: string;
  updatedAt?: string;
}

type SavesContext = {
  savedIds: ReadonlySet<number>;
  metadata: Record<number, ShortlistItemMetadata>;
  ready: boolean;
  isSaved: (id: number) => boolean;
  toggleSave: (id: number) => void;
  updateMetadata: (id: number, updates: Partial<ShortlistItemMetadata>) => Promise<void>;
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
  const [metadata, setMetadata] = useState<Record<number, ShortlistItemMetadata>>({});
  const [ready, setReady] = useState(false);

  const cloud = firebaseEnabled && !!user;

  // Local hydration — owns the state whenever we're not on the cloud path.
  // Deferred (like PoiProvider) so it doesn't run synchronously in the effect.
  useEffect(() => {
    if (cloud) return;
    const t = window.setTimeout(() => {
      const ids = readLocal();
      setSavedIds(new Set(ids));
      
      const localMeta: Record<number, ShortlistItemMetadata> = {};
      for (const id of ids) {
        localMeta[id] = { status: "shortlisted" };
      }
      setMetadata(localMeta);
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
        const data = snap.data();
        const ids = (data?.ids ?? []) as number[];
        const meta = (data?.metadata ?? {}) as Record<number, ShortlistItemMetadata>;
        setSavedIds(new Set(ids.filter((v) => Number.isInteger(v))));
        
        // Clean up metadata to only include keys present in ids
        const cleanedMeta: Record<number, ShortlistItemMetadata> = {};
        for (const id of ids) {
          if (Number.isInteger(id)) {
            cleanedMeta[id] = meta[id] ?? { status: "shortlisted" };
          }
        }
        setMetadata(cleanedMeta);
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

      if (has) {
        setMetadata((prev) => {
          const nextMeta = { ...prev };
          delete nextMeta[id];
          return nextMeta;
        });
      } else {
        setMetadata((prev) => ({
          ...prev,
          [id]: { status: "shortlisted", updatedAt: new Date().toISOString() },
        }));
      }

      if (cloud && user) {
        const fb = getFirebase();
        if (fb) {
          if (has) {
            void updateDoc(doc(fb.db, "saves", user.uid), {
              ids: arrayRemove(id),
              [`metadata.${id}`]: deleteField(),
            }).catch(() => {
              void setDoc(
                doc(fb.db, "saves", user.uid),
                { ids: arrayRemove(id) },
                { merge: true }
              ).catch(() => {});
            });
          } else {
            void setDoc(
              doc(fb.db, "saves", user.uid),
              {
                ids: arrayUnion(id),
                metadata: {
                  [id]: { status: "shortlisted", updatedAt: new Date().toISOString() }
                }
              },
              { merge: true },
            ).catch(() => {});
          }
        }
      } else {
        writeLocal([...next]);
      }
    },
    [savedIds, cloud, user],
  );

  const updateMetadata = useCallback(
    async (id: number, updates: Partial<ShortlistItemMetadata>) => {
      if (!savedIds.has(id)) return;

      const current = metadata[id] ?? { status: "shortlisted" };
      const updatedItem: ShortlistItemMetadata = {
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      if (updates.status) {
        if (updates.status === "contacted" && !updatedItem.contactedAt) {
          updatedItem.contactedAt = new Date().toISOString();
        }
        if (updates.status === "visited" && !updatedItem.visitedAt) {
          updatedItem.visitedAt = new Date().toISOString();
        }
        if (updates.status === "booked" && !updatedItem.bookedAt) {
          updatedItem.bookedAt = new Date().toISOString();
        }
      }

      setMetadata((prev) => ({
        ...prev,
        [id]: updatedItem,
      }));

      if (cloud && user) {
        const fb = getFirebase();
        if (fb) {
          try {
            await setDoc(
              doc(fb.db, "saves", user.uid),
              {
                metadata: {
                  [id]: updatedItem,
                },
              },
              { merge: true },
            );
          } catch (e) {
            console.error("Failed to update metadata in Firestore:", e);
          }
        }
      }
    },
    [savedIds, metadata, cloud, user],
  );

  const isSaved = useCallback((id: number) => savedIds.has(id), [savedIds]);

  const value = useMemo(
    () => ({ savedIds, metadata, ready, isSaved, toggleSave, updateMetadata }),
    [savedIds, metadata, ready, isSaved, toggleSave, updateMetadata],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSaves(): SavesContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSaves must be used within a SavesProvider");
  return ctx;
}
