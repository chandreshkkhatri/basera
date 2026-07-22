"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapPinned } from "lucide-react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-provider";
import { firebaseEnabled, getFirebase } from "@/lib/firebase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { City } from "@/db/schema";

const STORAGE_KEY = "basera:city";

/**
 * Header city picker. The selected city (slug) lives in the URL `city` param —
 * the server resolves it and scopes every listing query. We also persist the
 * choice to localStorage and Firestore (for logged-in users) so a fresh visit
 * (no param) lands on the user's last city across devices.
 * Changing the city keeps other filters but resets pagination.
 */
export function CitySelector({ cities }: { cities: City[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const cloud = firebaseEnabled && !!user;

  // The active city mirrors the server's resolveCity(): the URL slug if it's a
  // valid enabled city, else the first enabled city.
  const urlSlug = searchParams.get("city");
  const activeSlug =
    (urlSlug && cities.find((c) => c.slug === urlSlug)?.slug) ||
    cities[0]?.slug ||
    "";

  // Firestore subscription for logged-in users
  useEffect(() => {
    if (!cloud || !user) return;
    const fb = getFirebase();
    if (!fb) return;
    const ref = doc(fb.db, "locations", user.uid);

    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      const remoteCity = data?.city as string | undefined;
      const currentUrlCity = searchParams.get("city");

      if (remoteCity && cities.some((c) => c.slug === remoteCity)) {
        try {
          localStorage.setItem(STORAGE_KEY, remoteCity);
        } catch {
          // ignore
        }
        if (!currentUrlCity) {
          router.replace(`${pathname}?city=${remoteCity}`, { scroll: false });
        }
      } else if (currentUrlCity) {
        void setDoc(
          ref,
          { city: currentUrlCity, updatedAt: new Date().toISOString() },
          { merge: true },
        ).catch(() => {});
      }
    });
    return unsub;
  }, [cloud, user, searchParams, pathname, router, cities]);

  // Persist the active city; on a URL with no explicit city, restore stored
  // city if enabled and differs from the server default.
  useEffect(() => {
    const urlCity = searchParams.get("city");
    if (urlCity) {
      try {
        localStorage.setItem(STORAGE_KEY, urlCity);
      } catch {
        // ignore
      }
      if (cloud && user) {
        const fb = getFirebase();
        if (fb) {
          const ref = doc(fb.db, "locations", user.uid);
          void setDoc(
            ref,
            { city: urlCity, updatedAt: new Date().toISOString() },
            { merge: true },
          ).catch(() => {});
        }
      }
      return;
    }
    if (!cloud) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (
          stored &&
          stored !== activeSlug &&
          cities.some((c) => c.slug === stored)
        ) {
          router.replace(`${pathname}?city=${stored}`, { scroll: false });
        }
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, activeSlug, cloud, user]);

  const onChange = (slug: string) => {
    // Switching cities changes the whole result set — start filters fresh,
    // keeping only the POI (which is city-independent).
    const q = new URLSearchParams();
    q.set("city", slug);
    const poiLat = searchParams.get("poiLat");
    const poiLng = searchParams.get("poiLng");
    if (poiLat && poiLng) {
      q.set("poiLat", poiLat);
      q.set("poiLng", poiLng);
    }
    try {
      localStorage.setItem(STORAGE_KEY, slug);
    } catch {
      // ignore
    }

    if (cloud && user) {
      const fb = getFirebase();
      if (fb) {
        const ref = doc(fb.db, "locations", user.uid);
        void setDoc(
          ref,
          { city: slug, updatedAt: new Date().toISOString() },
          { merge: true },
        ).catch(() => {});
      }
    }

    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  };

  if (cities.length === 0) return null;

  return (
    <Select value={activeSlug} onValueChange={onChange}>
      <SelectTrigger size="sm" className="min-w-[130px]">
        <MapPinned className="size-3.5" />
        <SelectValue placeholder="City" />
      </SelectTrigger>
      <SelectContent>
        {cities.map((c) => (
          <SelectItem key={c.slug} value={c.slug}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

