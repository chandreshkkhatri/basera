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
import type { ShortlistItemMetadata, ShortlistStatus } from "@/lib/shortlist";

export type { ShortlistItemMetadata, ShortlistStatus };

const STORAGE_KEY = "basera:saves";
const META_KEY = "basera:saves:meta";

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

function readLocalMeta(): Record<number, ShortlistItemMetadata> {
  try {
    const raw = localStorage.getItem(META_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object"
      ? (parsed as Record<number, ShortlistItemMetadata>)
      : {};
  } catch {
    return {};
  }
}

function writeLocalMeta(meta: Record<number, ShortlistItemMetadata>) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // storage unavailable
  }
}

function setsEqual(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Shortlist store with per-listing pipeline metadata (status/notes/visitDate).
 * Signed-in + Firebase configured: a Firestore doc `saves/{uid}`, synced across
 * devices. Otherwise: localStorage (ids AND metadata), so the tracker works
 * fully offline / pre-Firebase, and a signed-out user's local saves + metadata
 * migrate up to Firestore on first sign-in.
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
      const storedMeta = readLocalMeta();
      const meta: Record<number, ShortlistItemMetadata> = {};
      for (const id of ids) meta[id] = storedMeta[id] ?? { status: "shortlisted" };
      setSavedIds(new Set(ids));
      setMetadata(meta);
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

    // Migrate legacy local saves (ids + metadata) up on first sign-in.
    const localIds = readLocal();
    const localMeta = readLocalMeta();
    if (localIds.length) {
      const metaForKnownIds: Record<number, ShortlistItemMetadata> = {};
      for (const id of localIds) {
        if (localMeta[id]) metaForKnownIds[id] = localMeta[id];
      }
      setDoc(
        ref,
        { ids: arrayUnion(...localIds), metadata: metaForKnownIds },
        { merge: true },
      )
        .then(() => {
          writeLocal([]);
          writeLocalMeta({});
        })
        .catch(() => {});
    }

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        const ids = (data?.ids ?? []) as number[];
        const meta = (data?.metadata ?? {}) as Record<number, ShortlistItemMetadata>;
        const idSet = new Set(ids.filter((v) => Number.isInteger(v)));
        // Preserve identity when the id set is unchanged (metadata-only edits
        // are frequent) so downstream fetch effects don't needlessly re-run.
        setSavedIds((prev) => (setsEqual(prev, idSet) ? prev : idSet));

        const cleaned: Record<number, ShortlistItemMetadata> = {};
        for (const id of idSet) cleaned[id] = meta[id] ?? { status: "shortlisted" };
        setMetadata(cleaned);
        setReady(true);
      },
      () => setReady(true),
    );
    return unsub;
  }, [cloud, user]);

  const toggleSave = useCallback(
    (id: number) => {
      const has = savedIds.has(id);
      const nextIds = new Set(savedIds);
      if (has) nextIds.delete(id);
      else nextIds.add(id);
      setSavedIds(nextIds); // optimistic

      const nextMeta = { ...metadata };
      if (has) delete nextMeta[id];
      else nextMeta[id] = { status: "shortlisted", updatedAt: new Date().toISOString() };
      setMetadata(nextMeta);

      if (cloud && user) {
        const fb = getFirebase();
        if (fb) {
          const ref = doc(fb.db, "saves", user.uid);
          if (has) {
            void updateDoc(ref, {
              ids: arrayRemove(id),
              [`metadata.${id}`]: deleteField(),
            }).catch(() => {
              void setDoc(ref, { ids: arrayRemove(id) }, { merge: true }).catch(() => {});
            });
          } else {
            void setDoc(
              ref,
              { ids: arrayUnion(id), metadata: { [id]: nextMeta[id] } },
              { merge: true },
            ).catch(() => {});
          }
        }
      } else {
        writeLocal([...nextIds]);
        writeLocalMeta(nextMeta);
      }
    },
    [savedIds, metadata, cloud, user],
  );

  const updateMetadata = useCallback(
    async (id: number, updates: Partial<ShortlistItemMetadata>) => {
      if (!savedIds.has(id)) return;

      const current = metadata[id] ?? { status: "shortlisted" };
      const now = new Date().toISOString();
      // Only the fields that actually change this call — written as dot-paths
      // so a concurrent edit to a different field on another device survives.
      const changed: Partial<ShortlistItemMetadata> = { ...updates, updatedAt: now };
      if (updates.status === "contacted" && !current.contactedAt) changed.contactedAt = now;
      if (updates.status === "visited" && !current.visitedAt) changed.visitedAt = now;
      if (updates.status === "booked" && !current.bookedAt) changed.bookedAt = now;

      const updatedItem: ShortlistItemMetadata = { ...current, ...changed };
      const nextMap = { ...metadata, [id]: updatedItem };
      setMetadata(nextMap);

      if (cloud && user) {
        const fb = getFirebase();
        if (!fb) return;
        const ref = doc(fb.db, "saves", user.uid);
        const payload: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(changed)) payload[`metadata.${id}.${k}`] = v;
        try {
          await updateDoc(ref, payload);
        } catch {
          // Doc/metadata map may not exist yet (legacy row) — fall back.
          await setDoc(ref, { metadata: { [id]: updatedItem } }, { merge: true }).catch(
            () => {},
          );
        }
      } else {
        writeLocalMeta(nextMap);
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
