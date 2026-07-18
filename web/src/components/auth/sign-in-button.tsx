"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

/**
 * Header auth control: "Sign in" when signed out, avatar + sign-out menu when
 * signed in. Renders nothing when Firebase isn't configured, so the header is
 * unchanged until setup.
 */
export function SignInButton() {
  const { enabled, ready, user, signIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!enabled || !ready) return null;

  if (!user) {
    return (
      <Button variant="outline" size="sm" onClick={() => void signIn()}>
        Sign in
      </Button>
    );
  }

  const initial = (user.displayName || user.email || "?").charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex size-8 items-center justify-center overflow-hidden rounded-full border bg-muted text-sm font-medium text-foreground"
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Google avatar, not a Next asset
          <img src={user.photoURL} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initial
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="border-b px-3 py-2">
            <p className="truncate text-sm font-medium">{user.displayName ?? "Signed in"}</p>
            {user.email && (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
