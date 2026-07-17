import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getListingById } from "@/db/queries/listings";
import { formatRent } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Rental listing on Basera";

// Brand violet ramp (globals.css oklch values, hex-approximated for Satori).
const BG = "#131118";
const CARD = "#1c1926";
const BRAND = "#7c4dff";
const MUTED = "#a09aae";

async function interSemiBold() {
  return readFile(join(process.cwd(), "src/assets/inter-semibold.ttf"));
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = Number.isInteger(Number(id))
    ? await getListingById(Number(id)).catch(() => null)
    : null;

  const rent = listing ? formatRent(listing.rent) : null;
  const place = listing
    ? [listing.location, listing.city].filter(Boolean).join(", ")
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: `linear-gradient(135deg, ${BG} 60%, #2a1d4d 100%)`,
          color: "white",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: BRAND,
              fontSize: 34,
            }}
          >
            b
          </div>
          <div style={{ fontSize: 40 }}>basera</div>
        </div>

        {listing ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: CARD,
              borderRadius: 24,
              padding: 48,
            }}
          >
            <div style={{ fontSize: 76, color: "white" }}>{rent}</div>
            <div style={{ fontSize: 40, color: BRAND }}>
              {[listing.bhk, place].filter(Boolean).join(" · ") ||
                "Rental listing"}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 56 }}>Rooms &amp; rentals near you</div>
        )}

        <div style={{ fontSize: 28, color: MUTED }}>
          Aggregated from local groups · sorted by distance from your point
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Inter",
          data: await interSemiBold(),
          weight: 600,
          style: "normal",
        },
      ],
    },
  );
}
