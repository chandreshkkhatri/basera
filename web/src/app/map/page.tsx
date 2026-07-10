import { Suspense } from "react";
import { getEnabledCities, resolveCity } from "@/db/queries/cities";
import { MapScreen } from "@/components/map/map-screen";
import { EmptyState } from "@/components/empty-state";

// Thin server shell: resolve the selected city, hand off to the client
// MapScreen which reads searchParams and fetches markers from /api/listings.
export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const params = await searchParams;
  const enabled = await getEnabledCities();
  const city = await resolveCity(
    typeof params.city === "string" ? params.city : undefined,
    enabled,
  );

  if (!city) {
    return (
      <EmptyState
        title="No cities available yet"
        hint="An admin needs to enable a city before the map has anything to show."
      />
    );
  }

  return (
    <Suspense>
      <MapScreen
        cityName={city.name}
        center={
          city.centerLat != null && city.centerLng != null
            ? [city.centerLat, city.centerLng]
            : null
        }
      />
    </Suspense>
  );
}
