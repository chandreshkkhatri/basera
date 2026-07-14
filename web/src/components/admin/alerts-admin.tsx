"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AlertCategoryToggle } from "@/db/queries/admin";

/**
 * Delivery toggles for the ingestion engine's Telegram alerts (operator
 * notifications — nothing here is user-facing). Muting suppresses delivery
 * only; alerts are still recorded in the outbox for the audit trail.
 */
export function AlertsAdmin({ categories }: { categories: AlertCategoryToggle[] }) {
  const router = useRouter();

  const toggle = async (category: string, enabled: boolean) => {
    await fetch("/api/admin/alert-categories", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, enabled }),
    });
    router.refresh();
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground">
          Telegram alerts
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Operator notifications from the ingestion engine. Muted categories
          are still recorded in the outbox, just not delivered.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Fires when</th>
              <th className="px-3 py-2 font-medium">Delivery</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.category} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{c.label}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.hint}</td>
                <td className="px-3 py-2">
                  <Button
                    variant={c.enabled ? "secondary" : "outline"}
                    size="xs"
                    onClick={() => toggle(c.category, !c.enabled)}
                  >
                    {c.enabled ? "Enabled" : "Muted"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
