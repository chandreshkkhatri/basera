import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Basera — rooms & rentals near you";

const BG = "#131118";
const BRAND = "#7c4dff";
const MUTED = "#a09aae";

/** Brand card for shares of the feed/home pages. */
export default async function OgImage() {
  const inter = await readFile(join(process.cwd(), "src/assets/inter-semibold.ttf"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          background: `linear-gradient(135deg, ${BG} 60%, #2a1d4d 100%)`,
          color: "white",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 88,
              height: 88,
              borderRadius: 24,
              background: BRAND,
              fontSize: 54,
            }}
          >
            b
          </div>
          <div style={{ fontSize: 84 }}>basera</div>
        </div>
        <div style={{ fontSize: 36, color: MUTED }}>
          Rooms &amp; rentals near you — from local groups
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Inter", data: inter, weight: 600, style: "normal" }],
    },
  );
}
