/**
 * Dev seed: ~150 realistic Pune rental listings + a handful of scrape_runs.
 * Idempotent (ON CONFLICT DO NOTHING on the unique (source, source_id)).
 * Run with `npm run db:seed`. This unblocks all web UI work before the Python
 * ingestion engine is ready to write real rows.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { listings, scrapeRuns, type NewListing, type Source } from "@/db/schema";

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

const LOCALITIES: { name: string; lat: number; lng: number }[] = [
  { name: "Baner", lat: 18.5590, lng: 73.7868 },
  { name: "Wakad", lat: 18.5983, lng: 73.7628 },
  { name: "Hinjewadi", lat: 18.5913, lng: 73.7389 },
  { name: "Balewadi", lat: 18.5745, lng: 73.7699 },
  { name: "Kharadi", lat: 18.5515, lng: 73.9430 },
  { name: "Aundh", lat: 18.5636, lng: 73.8074 },
  { name: "Viman Nagar", lat: 18.5679, lng: 73.9143 },
  { name: "Kothrud", lat: 18.5074, lng: 73.8077 },
  { name: "Hadapsar", lat: 18.5089, lng: 73.9260 },
  { name: "Magarpatta", lat: 18.5157, lng: 73.9280 },
  { name: "Koregaon Park", lat: 18.5362, lng: 73.8939 },
  { name: "Pimple Saudagar", lat: 18.5980, lng: 73.8073 },
  { name: "Wagholi", lat: 18.5793, lng: 73.9819 },
  { name: "Bavdhan", lat: 18.5089, lng: 73.7757 },
  { name: "Katraj", lat: 18.4482, lng: 73.8654 },
];

const BHKS = ["1 RK", "1 BHK", "1 BHK", "2 BHK", "2 BHK", "2 BHK", "3 BHK", "4 BHK"];
const GENDERS: NewListing["genderPreference"][] = [
  "any",
  "any",
  "any",
  "male",
  "female",
  "family",
  "bachelor",
];
const FURNISHINGS: (NewListing["furnishingStatus"])[] = [
  "fully furnished",
  "semi furnished",
  "unfurnished",
  null,
];
const SOURCES: Source[] = ["telegram", "whatsapp", "facebook"];
const GROUPS: Record<Source, string[]> = {
  telegram: ["Pune Flats & Flatmates", "PG & Rentals Pune", "Pune Rentals No Broker"],
  whatsapp: ["Baner Rentals", "Hinjewadi Housing", "IT Park Flatmates"],
  facebook: [
    "Flats & Flatmates in Pune (No Brokerage)",
    "Pune Rent House / Flat / Room",
  ],
};

function contactFor(source: Source, i: number): { url: string; name: string } {
  const names = ["Rahul", "Priya", "Amit", "Sneha", "Vikram", "Neha", "Karan", "Divya"];
  const name = pick(names);
  if (source === "telegram") {
    return { url: `https://t.me/user_${1000 + i}`, name };
  }
  if (source === "whatsapp") {
    return { url: `https://wa.me/9198${randInt(10000000, 99999999)}`, name };
  }
  return {
    url: `https://www.facebook.com/groups/purental/posts/${900000000 + i}/`,
    name,
  };
}

function bodyText(loc: string, bhk: string, rent: number | null): string {
  const deposit = rent ? `Deposit ${rent * randInt(1, 3)}.` : "Deposit negotiable.";
  const extras = pick([
    "Semi furnished with wardrobe and modular kitchen.",
    "Fully furnished, ready to move in.",
    "Independent, ample parking, 24x7 water.",
    "Close to IT park, walking distance to bus stop.",
    "No brokerage. Society with gym and pool.",
  ]);
  const rentLine = rent ? `Rent ${rent}/month.` : "Rent negotiable, contact for details.";
  return `${bhk} available for rent in ${loc}. ${rentLine} ${deposit} ${extras} Contact for viewing.`;
}

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const rows: NewListing[] = [];

  for (let i = 0; i < 150; i++) {
    const source = pick(SOURCES);
    const loc = pick(LOCALITIES);
    const bhk = pick(BHKS);
    const rent = chance(0.1) ? null : randInt(8, 60) * 1000;
    const hasCoords = !chance(0.15);
    const postedAt = new Date(NOW - randInt(0, 45) * DAY - randInt(0, 23) * 3600 * 1000);
    const contact = contactFor(source, i);

    // A few non-active / non-rental rows to exercise the base predicate.
    const roll = rand();
    const status: NewListing["status"] =
      roll < 0.04 ? "stale" : roll < 0.07 ? "hidden" : "active";
    const isRental = !chance(0.05);

    rows.push({
      source,
      sourceId: `seed_${source}_${i}`,
      sourceUrl:
        source === "facebook"
          ? contact.url
          : source === "telegram"
            ? `https://t.me/c/1234567890/${100 + i}`
            : null,
      sourceGroup: pick(GROUPS[source]),
      postedAt,
      location: loc.name,
      city: "Pune",
      rent,
      bhk,
      genderPreference: pick(GENDERS),
      furnishingStatus: pick(FURNISHINGS),
      additionalDetails: chance(0.5) ? "Immediate possession" : null,
      latitude: hasCoords ? loc.lat + (rand() - 0.5) * 0.01 : null,
      longitude: hasCoords ? loc.lng + (rand() - 0.5) * 0.01 : null,
      originalText: bodyText(loc.name, bhk, rent),
      contactName: contact.name,
      contactUrl: contact.url,
      isRental,
      status,
    });
  }

  await db.insert(listings).values(rows).onConflictDoNothing();

  const runs = [
    { source: "telegram", target: "@pune_rentals", ok: true, seen: 120, added: 14 },
    { source: "facebook", target: "groups/purental", ok: true, seen: 50, added: 9 },
    { source: "whatsapp", target: "Baner Rentals", ok: true, seen: 33, added: 5 },
    { source: "facebook", target: "groups/broken", ok: false, seen: 0, added: 0 },
  ];
  for (const r of runs) {
    const started = new Date(NOW - randInt(1, 20) * 3600 * 1000);
    await db.insert(scrapeRuns).values({
      source: r.source,
      target: r.target,
      startedAt: started,
      finishedAt: new Date(started.getTime() + randInt(30, 300) * 1000),
      postsSeen: r.seen,
      postsNew: r.added,
      listingsUpserted: r.added,
      status: r.ok ? "success" : "error",
      error: r.ok ? null : "TimeoutError: navigation to group timed out after 30000ms",
    });
  }

  const total = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings);
  console.log(`Seed complete. listings total: ${total[0]?.count ?? 0}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
