import Link from "next/link";

/** Minimal footer; home of the operator links demoted from the primary nav. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 text-xs text-muted-foreground">
        <p>Basera — rooms &amp; rentals from local groups.</p>
        <nav className="flex gap-4" aria-label="Secondary">
          <Link href="/status" className="transition-colors hover:text-foreground">
            Status
          </Link>
          <Link href="/admin" className="transition-colors hover:text-foreground">
            Admin
          </Link>
        </nav>
      </div>
    </footer>
  );
}
