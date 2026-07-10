"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.refresh();
  };
  return (
    <Button variant="outline" size="sm" onClick={logout}>
      <LogOut className="size-3.5" />
      Sign out
    </Button>
  );
}
