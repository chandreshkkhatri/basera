import { formatDistanceToNowStrict } from "date-fns";

export function formatRent(rent: number | null): string {
  if (rent == null) return "Rent not specified";
  return `₹${rent.toLocaleString("en-IN")}/mo`;
}

export function postedAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${formatDistanceToNowStrict(d)} ago`;
}

export function formatDistanceKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}
