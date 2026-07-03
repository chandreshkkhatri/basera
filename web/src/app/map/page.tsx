import { Suspense } from "react";
import { getCities } from "@/db/queries/listings";
import { MapScreen } from "@/components/map/map-screen";

// Thin server shell: fetch filter options, hand off to the client MapScreen
// which reads searchParams and fetches markers from /api/listings.
export default async function MapPage() {
  const cities = await getCities();
  return (
    <Suspense>
      <MapScreen cities={cities} />
    </Suspense>
  );
}
