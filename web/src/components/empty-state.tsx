import Link from "next/link";
import { SearchX } from "lucide-react";

export function EmptyState({
  title = "No listings match your filters",
  hint = "Try widening your rent range, clearing the city, or including more sources.",
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <SearchX className="size-8 text-muted-foreground" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      <Link
        href="/"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Clear all filters
      </Link>
    </div>
  );
}
