"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PoiPicker } from "@/components/poi/poi-picker";
import { SignInButton } from "@/components/auth/sign-in-button";
import { CitySelector } from "@/components/city-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "@/components/wordmark";
import type { City } from "@/db/schema";
import { cn } from "@/lib/utils";

// Primary nav is Feed/Map only (desktop pills; mobile uses BottomNav).
// Status/Admin live in the footer.
const NAV = [
  { href: "/", label: "Feed" },
  { href: "/map", label: "Map" },
  { href: "/saved", label: "Saved" },
];

export function SiteHeader({ cities }: { cities: City[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Wordmark />
        <Suspense
          fallback={<div className="h-8 w-32.5 rounded-lg bg-muted" />}
        >
          <CitySelector cities={cities} />
        </Suspense>
        <nav className="hidden items-center gap-1 text-sm sm:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-md px-2.5 py-1.5 transition-colors",
                isActive(n.href)
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          {/* On mobile the POI picker lives in the BottomNav instead. */}
          <div className="hidden sm:block">
            <PoiPicker />
          </div>
          <ThemeToggle />
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
