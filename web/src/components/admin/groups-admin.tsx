"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GroupWithCity } from "@/db/queries/admin";

export function GroupsAdmin({
  groups,
  cities,
}: {
  groups: GroupWithCity[];
  cities: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addGroup = async () => {
    if (!url.trim() || !cityId) {
      setError("Enter a group URL and pick a city");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, cityId: Number(cityId) }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to add group");
      return;
    }
    setUrl("");
    router.refresh();
  };

  const toggle = async (id: number, enabled: boolean) => {
    await fetch("/api/admin/groups", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    router.refresh();
  };

  const remove = async (id: number) => {
    await fetch(`/api/admin/groups?id=${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Facebook groups
      </h2>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Group URL</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 text-right font-medium">Listings</th>
              <th className="px-3 py-2 font-medium">Scraped?</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-b last:border-0">
                <td className="max-w-[320px] truncate px-3 py-2">
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:underline"
                  >
                    {g.name || g.url}
                  </a>
                </td>
                <td className="px-3 py-2">{g.cityName}</td>
                <td className="px-3 py-2 text-right">{g.listingCount}</td>
                <td className="px-3 py-2">
                  <Button
                    variant={g.enabled ? "secondary" : "outline"}
                    size="xs"
                    onClick={() => toggle(g.id, !g.enabled)}
                  >
                    {g.enabled ? "Enabled" : "Disabled"}
                  </Button>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => remove(g.id)}
                    aria-label="Delete group"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  No groups registered. Add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="https://www.facebook.com/groups/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-8 min-w-[280px] flex-1"
        />
        <Select value={cityId} onValueChange={setCityId}>
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue placeholder="Assign city" />
          </SelectTrigger>
          <SelectContent>
            {cities.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={addGroup} disabled={busy}>
          <Plus className="size-3.5" />
          Add group
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {cities.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add a city first before registering groups.
        </p>
      )}
    </section>
  );
}
