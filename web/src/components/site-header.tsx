"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { PoiPicker } from "@/components/poi/poi-picker";
import { CitySelector } from "@/components/city-selector";
import type { City } from "@/db/schema";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Feed" },
  { href: "/map", label: "Map" },
  { href: "/status", label: "Status" },
  { href: "/admin", label: "Admin" },
];

export function SiteHeader({ cities }: { cities: City[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Home className="size-4" />
          </span>
          Basera
        </Link>
        <Suspense
          fallback={<div className="h-8 w-32.5 rounded-lg bg-muted" />}
        >
          <CitySelector cities={cities} />
        </Suspense>
        <nav className="flex items-center gap-1 text-sm">
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
        <div className="ml-auto">
          <PoiPicker />
        </div>
      </div>
    </header>
  );
}
