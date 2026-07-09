import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Toggle chip used for multi-select filters (BHK, gender, furnishing, posted
 * within). Renders a real button with `aria-pressed` so selection state is
 * exposed to assistive tech — replaces the ad-hoc `chip()` class that lived in
 * FilterBar.
 */
function Chip({
  active = false,
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type={type}
      data-slot="chip"
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-sm font-medium transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border text-foreground hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Chip };
