import { Suspense } from "react";
import { getCities, getListings } from "@/db/queries/listings";
import { parseFilters } from "@/lib/filters";
import { FilterBar } from "@/components/filter-bar";
import { ListingGrid } from "@/components/listing-grid";
import { Pagination } from "@/components/pagination";

export default async function FeedPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const [{ rows, total, page, pageSize }, cities] = await Promise.all([
    getListings(filters),
    getCities(),
  ]);

  // Base params for pagination links = current query minus `page`.
  const baseParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "page" || v == null) continue;
    baseParams.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rental listings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total.toLocaleString("en-IN")}{" "}
          {total === 1 ? "listing" : "listings"} aggregated from Telegram,
          WhatsApp and Facebook groups.
        </p>
      </div>

      <Suspense>
        <FilterBar cities={cities} />
      </Suspense>

      <ListingGrid listings={rows} />

      <Pagination
        page={page}
        total={total}
        pageSize={pageSize}
        baseParams={baseParams}
      />
    </div>
  );
}
