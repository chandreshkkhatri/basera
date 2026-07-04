"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Login failed");
    }
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 py-16">
      <div className="flex items-center gap-2">
        <Lock className="size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Admin access</h1>
      </div>
      {!configured ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Admin is not configured. Set <code>ADMIN_TOKEN</code> in the
          environment and restart the app.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Enter the admin token to manage cities and Facebook groups.
          </p>
          <Input
            type="password"
            placeholder="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={submit} disabled={busy || !token}>
            {busy ? "Checking…" : "Sign in"}
          </Button>
        </>
      )}
    </div>
  );
}
