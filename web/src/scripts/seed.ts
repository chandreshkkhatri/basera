/**
 * Dev seed: cities + Facebook groups + ~180 realistic listings across cities.
 * Sourcing is Facebook-only. Each listing belongs to a group, which belongs to
 * a city. Bengaluru is seeded DISABLED so you can exercise the admin toggle.
 *
 * Idempotent: cities/groups upsert on their unique keys, listings on
 * (source, source_id). Also reconciles any pre-existing rows (e.g. backfilled
 * data) that have a city name but no city_id.
 *
 * Run with `npm run db:seed`.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cities,
  groups,
  listings,
  scrapeRuns,
  type NewListing,
} from "@/db/schema";

// Deterministic RNG so re-seeding produces the same data.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const randInt = (lo: number, hi: number) =>
  lo + Math.floor(rand() * (hi - lo + 1));

type Locality = { name: string; lat: number; lng: number };
type CitySeed = {
  name: string;
  slug: string;
  enabled: boolean;
  order: number;
  center: [number, number];
  weight: number; // relative share of listings
  localities: Locality[];
  groups: { name: string; url: string }[];
};

const CITIES: CitySeed[] = [
  {
    name: "Pune",
    slug: "pune",
    enabled: true,
    order: 1,
    center: [18.5204, 73.8567],
    weight: 6,
    localities: [
      { name: "Baner", lat: 18.559, lng: 73.7868 },
      { name: "Wakad", lat: 18.5983, lng: 73.7628 },
      { name: "Hinjewadi", lat: 18.5913, lng: 73.7389 },
      { name: "Balewadi", lat: 18.5745, lng: 73.7699 },
      { name: "Kharadi", lat: 18.5515, lng: 73.943 },
      { name: "Aundh", lat: 18.5636, lng: 73.8074 },
      { name: "Viman Nagar", lat: 18.5679, lng: 73.9143 },
      { name: "Kothrud", lat: 18.5074, lng: 73.8077 },
      { name: "Hadapsar", lat: 18.5089, lng: 73.926 },
      { name: "Koregaon Park", lat: 18.5362, lng: 73.8939 },
    ],
    groups: [
      {
        name: "Flats & Flatmates in Pune (No Brokerage)",
        url: "https://www.facebook.com/groups/puneflatsnobrokerage",
      },
      {
        name: "Pune Rent House / Flat / Room",
        url: "https://www.facebook.com/groups/punerenthouse",
      },
    ],
  },
  {
    name: "Mumbai",
    slug: "mumbai",
    enabled: true,
    order: 2,
    center: [19.076, 72.8777],
    weight: 3,
    localities: [
      { name: "Andheri", lat: 19.1197, lng: 72.8468 },
      { name: "Bandra", lat: 19.0596, lng: 72.8295 },
      { name: "Powai", lat: 19.1176, lng: 72.906 },
      { name: "Goregaon", lat: 19.1663, lng: 72.8526 },
      { name: "Malad", lat: 19.1868, lng: 72.8484 },
      { name: "Chembur", lat: 19.0522, lng: 72.9005 },
      { name: "Thane", lat: 19.2183, lng: 72.9781 },
    ],
    groups: [
      {
        name: "Mumbai Flats Without Brokerage",
        url: "https://www.facebook.com/groups/mumbainobrokerage",
      },
      {
        name: "Rent House Mumbai",
        url: "https://www.facebook.com/groups/renthousemumbai",
      },
    ],
  },
  {
    name: "Bengaluru",
    slug: "bengaluru",
    enabled: false,
    order: 3,
    center: [12.9716, 77.5946],
    weight: 1,
    localities: [
      { name: "Koramangala", lat: 12.9352, lng: 77.6245 },
      { name: "Indiranagar", lat: 12.9784, lng: 77.6408 },
      { name: "HSR Layout", lat: 12.9116, lng: 77.6389 },
      { name: "Whitefield", lat: 12.9698, lng: 77.7499 },
      { name: "Marathahalli", lat: 12.9591, lng: 77.6974 },
    ],
    groups: [
      {
        name: "Bangalore Flatmates & Rentals",
        url: "https://www.facebook.com/groups/blrflatmates",
      },
    ],
  },
];

const BHKS = ["1 RK", "1 BHK", "1 BHK", "2 BHK", "2 BHK", "2 BHK", "3 BHK", "4 BHK"];
const GENDERS: NewListing["genderPreference"][] = [
  "any", "any", "any", "male", "female", "family", "bachelor",
];
const FURNISHINGS: NewListing["furnishingStatus"][] = [
  "fully furnished", "semi furnished", "unfurnished", null,
];
const NAMES = ["Rahul", "Priya", "Amit", "Sneha", "Vikram", "Neha", "Karan", "Divya"];

function bodyText(loc: string, city: string, bhk: string, rent: number | null): string {
  const deposit = rent ? `Deposit ${rent * randInt(1, 3)}.` : "Deposit negotiable.";
  const extras = pick([
    "Semi furnished with wardrobe and modular kitchen.",
    "Fully furnished, ready to move in.",
    "Independent, ample parking, 24x7 water.",
    "Close to metro, walking distance to bus stop.",
    "No brokerage. Society with gym and pool.",
  ]);
  const rentLine = rent ? `Rent ${rent}/month.` : "Rent negotiable, contact for details.";
  return `${bhk} available for rent in ${loc}, ${city}. ${rentLine} ${deposit} ${extras} Contact for viewing.`;
}

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

async function upsertCity(c: CitySeed): Promise<number> {
  await db
    .insert(cities)
    .values({
      name: c.name,
      slug: c.slug,
      enabled: c.enabled,
      displayOrder: c.order,
      centerLat: c.center[0],
      centerLng: c.center[1],
    })
    .onConflictDoNothing({ target: cities.slug });
  const [row] = await db.select().from(cities).where(eq(cities.slug, c.slug));
  return row.id;
}

async function main() {
  // Cities + groups.
  const cityIds = new Map<string, number>();
  const groupUrlsByCity = new Map<number, string[]>();
  for (const c of CITIES) {
    const cityId = await upsertCity(c);
    cityIds.set(c.slug, cityId);
    const urls: string[] = [];
    for (const g of c.groups) {
      await db
        .insert(groups)
        .values({ cityId, url: g.url, name: g.name })
        .onConflictDoNothing({ target: groups.url });
      urls.push(g.url);
    }
    groupUrlsByCity.set(cityId, urls);
  }

  // Weighted city pool for listing distribution.
  const cityPool: CitySeed[] = [];
  for (const c of CITIES) for (let i = 0; i < c.weight; i++) cityPool.push(c);

  const rows: NewListing[] = [];
  for (let i = 0; i < 180; i++) {
    const c = pick(cityPool);
    const cityId = cityIds.get(c.slug)!;
    const groupUrl = pick(groupUrlsByCity.get(cityId)!);
    const loc = pick(c.localities);
    const bhk = pick(BHKS);
    const rent = chance(0.1) ? null : randInt(8, 60) * 1000;
    const hasCoords = !chance(0.15);
    const postedAt = new Date(NOW - randInt(0, 45) * DAY - randInt(0, 23) * 3600 * 1000);

    const roll = rand();
    const status: NewListing["status"] =
      roll < 0.04 ? "stale" : roll < 0.07 ? "hidden" : "active";
    const isRental = !chance(0.05);

    rows.push({
      source: "facebook",
      sourceId: `seed_${c.slug}_${i}`,
      sourceUrl: `${groupUrl}/posts/${900000000 + i}/`,
      sourceGroup: groupUrl,
      postedAt,
      location: loc.name,
      city: c.name,
      cityId,
      rent,
      bhk,
      genderPreference: pick(GENDERS),
      furnishingStatus: pick(FURNISHINGS),
      additionalDetails: chance(0.5) ? "Immediate possession" : null,
      latitude: hasCoords ? loc.lat + (rand() - 0.5) * 0.01 : null,
      longitude: hasCoords ? loc.lng + (rand() - 0.5) * 0.01 : null,
      originalText: bodyText(loc.name, c.name, bhk, rent),
      contactName: pick(NAMES),
      contactUrl: `${groupUrl}/posts/${900000000 + i}/`,
      isRental,
      status,
    });
  }
  await db.insert(listings).values(rows).onConflictDoNothing();

  // Reconcile pre-existing rows (e.g. backfilled data) that have a city name
  // but no city_id, by matching the name to a seeded city.
  for (const c of CITIES) {
    await db
      .update(listings)
      .set({ cityId: cityIds.get(c.slug)! })
      .where(and(isNull(listings.cityId), sql`lower(${listings.city}) = ${c.slug === "bengaluru" ? "bengaluru" : c.name.toLowerCase()}`));
  }

  // A few Facebook scrape_runs for the /status page.
  const runTargets = [
    { url: "https://www.facebook.com/groups/puneflatsnobrokerage", ok: true, seen: 50, added: 12 },
    { url: "https://www.facebook.com/groups/punerenthouse", ok: true, seen: 44, added: 9 },
    { url: "https://www.facebook.com/groups/mumbainobrokerage", ok: true, seen: 38, added: 7 },
    { url: "https://www.facebook.com/groups/renthousemumbai", ok: false, seen: 0, added: 0 },
  ];
  for (const r of runTargets) {
    const started = new Date(NOW - randInt(1, 20) * 3600 * 1000);
    await db.insert(scrapeRuns).values({
      source: "facebook",
      target: r.url,
      startedAt: started,
      finishedAt: new Date(started.getTime() + randInt(30, 300) * 1000),
      postsSeen: r.seen,
      postsNew: r.added,
      listingsUpserted: r.added,
      status: r.ok ? "success" : "error",
      error: r.ok ? null : "TimeoutError: navigation to group timed out after 30000ms",
    });
  }

  const total = await db.select({ count: sql<number>`count(*)::int` }).from(listings);
  console.log(`Seed complete. listings total: ${total[0]?.count ?? 0}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
