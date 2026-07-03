import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="text-lg font-semibold">Listing not found</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        This listing may have been removed, or the link is incorrect.
      </p>
      <Button asChild>
        <Link href="/">Back to listings</Link>
      </Button>
    </div>
  );
}
