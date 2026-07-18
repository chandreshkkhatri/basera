"use client";

import { Heart } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useSaves } from "@/components/saves/saves-provider";
import { cn } from "@/lib/utils";

/**
 * Heart toggle for the shortlist. Rendered inside <Link>-wrapped cards/rows, so
 * it swallows the click. When Firebase is configured, saving is gated: a
 * signed-out click opens Google sign-in instead of saving. Invisible until the
 * saves context is ready (avoids hydration mismatch).
 */
export function SaveButton({
  id,
  size = "sm",
  className,
}: {
  id: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const { isSaved, toggleSave, ready } = useSaves();
  const { enabled, user, signIn } = useAuth();
  if (!ready) return null;
  const saved = isSaved(id);
  const gated = enabled && !user;

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={
        gated ? "Sign in to save" : saved ? "Remove from saved" : "Save listing"
      }
      title={
        gated ? "Sign in to save" : saved ? "Remove from saved" : "Save listing"
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (gated) void signIn();
        else toggleSave(id);
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-full border bg-background/80 backdrop-blur transition-colors hover:bg-background",
        size === "sm" ? "size-7" : "size-9",
        saved ? "border-brand/50 text-brand" : "text-muted-foreground",
        className,
      )}
    >
      <Heart
        className={cn(size === "sm" ? "size-3.5" : "size-4.5", saved && "fill-current")}
      />
    </button>
  );
}
