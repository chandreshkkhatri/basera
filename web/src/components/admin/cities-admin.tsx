"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CityWithCounts } from "@/db/queries/admin";

export function CitiesAdmin({ cities }: { cities: CityWithCounts[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const addCity = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await fetch("/api/admin/cities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    setName("");
    router.refresh();
  };

  const toggle = async (id: number, enabled: boolean) => {
    await fetch("/api/admin/cities", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    router.refresh();
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Cities</h2>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Slug</th>
              <th className="px-3 py-2 text-right font-medium">Groups</th>
              <th className="px-3 py-2 text-right font-medium">Listings</th>
              <th className="px-3 py-2 font-medium">Shown in app?</th>
            </tr>
          </thead>
          <tbody>
            {cities.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.slug}</td>
                <td className="px-3 py-2 text-right">{c.groupCount}</td>
                <td className="px-3 py-2 text-right">{c.listingCount}</td>
                <td className="px-3 py-2">
                  <Button
                    variant={c.enabled ? "secondary" : "outline"}
                    size="xs"
                    onClick={() => toggle(c.id, !c.enabled)}
                  >
                    {c.enabled ? "Enabled" : "Disabled"}
                  </Button>
                </td>
              </tr>
            ))}
            {cities.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  No cities yet. Add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Add a city, e.g. Hyderabad"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCity()}
          className="h-8 max-w-xs"
        />
        <Button size="sm" onClick={addCity} disabled={busy || !name.trim()}>
          <Plus className="size-3.5" />
          Add city
        </Button>
      </div>
    </section>
  );
}
