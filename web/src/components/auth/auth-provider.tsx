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
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { firebaseEnabled, getFirebase } from "@/lib/firebase";

type AuthContext = {
  user: User | null;
  /** false until Firebase reports the initial auth state. */
  ready: boolean;
  /** whether Firebase is configured at all (env present). */
  enabled: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // If Firebase isn't configured we're immediately "ready" with no user.
  const [ready, setReady] = useState(!firebaseEnabled);

  useEffect(() => {
    const fb = getFirebase();
    if (!fb) return;
    const unsub = onAuthStateChanged(fb.auth, (u) => {
      setUser(u);
      setReady(true);
    });
    return unsub;
  }, []);

  const signIn = useCallback(async () => {
    const fb = getFirebase();
    if (!fb) return;
    try {
      // Popup, not redirect: redirect breaks under third-party-cookie blocking.
      await signInWithPopup(fb.auth, new GoogleAuthProvider());
    } catch (e) {
      // user closed the popup or blocked it — nothing to surface
      if (process.env.NODE_ENV !== "production") console.debug("sign-in:", e);
    }
  }, []);

  const signOut = useCallback(async () => {
    const fb = getFirebase();
    if (fb) await fbSignOut(fb.auth);
  }, []);

  const value = useMemo(
    () => ({ user, ready, enabled: firebaseEnabled, signIn, signOut }),
    [user, ready, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
