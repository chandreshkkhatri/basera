"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "basera:theme";

/**
 * Reads the live `.dark` class on <html> as an external store. The class is
 * set before paint by the no-flash script in the root layout; a MutationObserver
 * keeps this in sync if it changes. Server snapshot is `true` (dark is the
 * default hero theme), matching the `dark` class the layout renders.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const getSnapshot = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, () => true);

  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private mode / storage disabled: preference just won't persist.
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
