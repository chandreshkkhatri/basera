import { cn } from "@/lib/utils";
import { sourceMeta } from "@/lib/sources";

export function SourceBadge({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const meta = sourceMeta(source);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        meta.badgeClass,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
