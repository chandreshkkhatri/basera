import { Suspense } from "react";
import type { Metadata } from "next";
import { getListings } from "@/db/queries/listings";
import { getEnabledCities, resolveCity } from "@/db/queries/cities";
import { parseFilters } from "@/lib/filters";
import { FilterBar } from "@/components/filter-bar";
import { ListingGrid } from "@/components/listing-grid";
import { ListingList } from "@/components/listing-list";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";

export async function generateMetadata({
  searchParams,
}: PageProps<"/">): Promise<Metadata> {
  const params = await searchParams;
  // Tolerate a down DB: fall back to the layout's default metadata.
  const enabled = await getEnabledCities().catch(() => []);
  const city = await resolveCity(
    typeof params.city === "string" ? params.city : undefined,
    enabled,
  );
  if (!city) return {};
  // The root page shares its segment with the root layout, so the layout's
  // title template ("%s | Basera") does NOT apply here — suffix manually.
  const title = `Rentals in ${city.name} | Basera`;
  const description =
    `Rooms, flats and PGs for rent in ${city.name}, aggregated from local ` +
    `Facebook groups. Filter by rent, BHK and furnishing, and sort by ` +
    `distance from your point.`;
  return {
    title,
    description,
    alternates: { canonical: `/?city=${city.slug}` },
    openGraph: { title, description, url: `/?city=${city.slug}` },
  };
}

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

  // Display-only layout choice (not a data filter). Default is the list view.
  const layout =
    (typeof params.layout === "string" ? params.layout : "") === "cards"
      ? "cards"
      : "list";

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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Rentals in {city.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">
            {total.toLocaleString("en-IN")}
          </span>{" "}
          {total === 1 ? "listing" : "listings"} aggregated from Facebook groups
          in {city.name}.
        </p>
      </div>

      <Suspense>
        <FilterBar />
      </Suspense>

      {layout === "cards" ? (
        <ListingGrid listings={rows} />
      ) : (
        <ListingList listings={rows} />
      )}

      <Pagination
        page={page}
        total={total}
        pageSize={pageSize}
        baseParams={baseParams}
      />
    </div>
  );
}
