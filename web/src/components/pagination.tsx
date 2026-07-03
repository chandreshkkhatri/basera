import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Link-based prev/next pagination that preserves every other query param.
 * `baseParams` is the current query string WITHOUT the `page` key.
 */
export function Pagination({
  page,
  total,
  pageSize,
  baseParams,
}: {
  page: number;
  total: number;
  pageSize: number;
  baseParams: URLSearchParams;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const href = (p: number) => {
    const q = new URLSearchParams(baseParams);
    if (p > 1) q.set("page", String(p));
    else q.delete("page");
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  const linkClass =
    "inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted";
  const disabledClass = "pointer-events-none opacity-40";

  return (
    <nav className="flex items-center justify-between gap-4 pt-2">
      <Link
        href={href(page - 1)}
        aria-disabled={page <= 1}
        className={cn(linkClass, page <= 1 && disabledClass)}
      >
        <ChevronLeft className="size-4" />
        Previous
      </Link>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      <Link
        href={href(page + 1)}
        aria-disabled={page >= pageCount}
        className={cn(linkClass, page >= pageCount && disabledClass)}
      >
        Next
        <ChevronRight className="size-4" />
      </Link>
    </nav>
  );
}
