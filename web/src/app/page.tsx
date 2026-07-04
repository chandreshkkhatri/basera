import { Suspense } from "react";
import { getListings } from "@/db/queries/listings";
import { getEnabledCities, resolveCity } from "@/db/queries/cities";
import { parseFilters } from "@/lib/filters";
import { FilterBar } from "@/components/filter-bar";
import { ListingGrid } from "@/components/listing-grid";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";

export default async function FeedPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const enabled = await getEnabledCities();
  const city = await resolveCity(
    typeof params.city === "string" ? params.city : undefined,
    enabled,
  );

  if (!city) {
    return (
      <EmptyState
        title="No cities available yet"
        hint="An admin needs to add and enable a city with Facebook groups before listings appear."
      />
    );
  }

  const { rows, total, page, pageSize } = await getListings(filters, city.id);

  // Base params for pagination links = current query minus `page` (keeps `city`).
  const baseParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "page" || v == null) continue;
    baseParams.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
  }
  baseParams.set("city", city.slug);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Rentals in {city.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total.toLocaleString("en-IN")}{" "}
          {total === 1 ? "listing" : "listings"} aggregated from Facebook groups
          in {city.name}.
        </p>
      </div>

      <Suspense>
        <FilterBar />
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
