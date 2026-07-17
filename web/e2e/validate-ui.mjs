// Standalone UI validation driven by Playwright against an already-running dev
// server (Next 16 refuses a second dev instance, so we target the running one).
//   BASE_URL=http://localhost:3000 node e2e/validate-ui.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "/tmp/basera-ui";
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
try {
  // --- Desktop, dark (default) ---
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    geolocation: { latitude: 18.5362, longitude: 73.894 },
    permissions: ["geolocation", "clipboard-read", "clipboard-write"],
  });
  const page = await desktop.newPage();

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const htmlClass = await page.locator("html").getAttribute("class");
  check("default theme is dark", (htmlClass ?? "").includes("dark"), htmlClass ?? "");
  // Default layout is the list view: a table on sm+, stacked rows on mobile.
  check("list view is default (desktop table)", await page.locator("[data-slot='table'] tbody tr").first().isVisible());
  await page.screenshot({ path: `${OUT}/01-feed-list.png`, fullPage: false });

  // Layout toggle -> cards
  await page.goto(`${BASE}/?layout=cards`, { waitUntil: "networkidle" });
  const cardTiles = await page.locator("a[href^='/listings/'] .aspect-16\\/10, a[href^='/listings/'] [class*='aspect-16']").count();
  check("cards view renders media tiles", cardTiles > 0, `${cardTiles} tiles`);
  await page.screenshot({ path: `${OUT}/02-feed-cards.png` });

  // Theme toggle
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /switch to (light|dark) theme/i }).click();
  await page.waitForTimeout(200);
  const afterToggle = await page.locator("html").getAttribute("class");
  check("theme toggle flips to light", !(afterToggle ?? "").includes("dark"));
  // back to dark for subsequent shots
  await page.getByRole("button", { name: /switch to (light|dark) theme/i }).click();

  // --- POI dialog: place search ---
  await page.getByRole("button", { name: /set your point/i }).click();
  const dialog = page.getByRole("dialog");
  check("POI dialog opens", await dialog.isVisible());
  await dialog.getByPlaceholder(/search a locality/i).fill("Koregaon Park Pune");
  const firstResult = dialog.locator("ul li button").first();
  await firstResult.waitFor({ state: "visible", timeout: 8000 });
  check("place search returns results", await dialog.locator("ul li button").count() > 0);
  await page.screenshot({ path: `${OUT}/03-poi-search.png` });
  await firstResult.click();
  await page.waitForTimeout(1200); // let the map recenter/tiles load
  await page.screenshot({ path: `${OUT}/04-poi-map.png` });

  // Geolocation path
  await dialog.getByRole("button", { name: /use my location/i }).click();
  await page.waitForTimeout(1500);
  const coordText = await dialog.locator("p.text-muted-foreground").last().textContent();
  check("geolocation sets a point", /\d+\.\d+,\s*-?\d+\.\d+/.test(coordText ?? ""), (coordText ?? "").trim());

  await dialog.getByRole("button", { name: /save point/i }).click();
  await page.waitForTimeout(400);
  const triggerText = await page.getByRole("button", { name: /my location|koregaon|my point/i }).count();
  check("saved POI reflected in trigger", triggerText > 0);

  // --- Stale-POI regression: moving the point must update URL + distances ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800); // let the default-sort effect write poiLat
  const latBefore = new URL(page.url()).searchParams.get("poiLat");
  check("distance sort defaulted with poiLat in URL", !!latBefore, `poiLat=${latBefore}`);
  await page.getByRole("button", { name: /my location|koregaon|my point/i }).first().click();
  const dialog2 = page.getByRole("dialog");
  await dialog2.getByPlaceholder(/search a locality/i).fill("Hinjawadi Pune");
  const result2 = dialog2.locator("ul li button").first();
  await result2.waitFor({ state: "visible", timeout: 8000 });
  await result2.click();
  await page.waitForTimeout(600);
  await dialog2.getByRole("button", { name: /save point/i }).click();
  await page.waitForTimeout(1200); // sync effect updates the URL
  const latAfter = new URL(page.url()).searchParams.get("poiLat");
  check(
    "moving the point updates URL poiLat (stale-distance fix)",
    !!latAfter && latAfter !== latBefore,
    `${latBefore} -> ${latAfter}`,
  );

  // --- Locality search autocomplete ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const searchBox = page.getByRole("combobox", { name: /search locality/i });
  await searchBox.fill("ba");
  const suggList = page.getByTestId("location-suggestions");
  await suggList.waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
  const suggCount = await suggList.locator("li").count().catch(() => 0);
  check("locality autocomplete shows suggestions", suggCount > 0, `${suggCount} items`);
  if (suggCount > 0) {
    const firstLoc = (await suggList.locator("li span").first().textContent()) ?? "";
    await suggList.locator("li button").first().click();
    await page.waitForTimeout(700);
    const qParam = new URL(page.url()).searchParams.get("q");
    check("picking a suggestion filters the feed", qParam === firstLoc.trim(), `q=${qParam}`);
  }

  // --- Detail page ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const firstHref = await page.locator("a[href^='/listings/']").first().getAttribute("href");
  await page.goto(`${BASE}${firstHref}`, { waitUntil: "networkidle" });
  check("detail: has h1 rent heading", await page.locator("h1").first().isVisible());
  check("detail: has media banner", await page.locator(".aspect-2\\/1, [class*='aspect-2']").first().isVisible());

  // Search-in-group terms: panel renders + copy button round-trips clipboard.
  const termsPanel = page.getByTestId("search-terms");
  check("detail: search-terms panel", await termsPanel.isVisible());
  const firstTerm = termsPanel.locator("button").first();
  const termText = (await firstTerm.locator("span").textContent()) ?? "";
  await firstTerm.click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check("detail: copy puts term on clipboard", clip.length > 0 && clip === termText.trim(), `"${clip.slice(0, 40)}"`);
  await page.screenshot({ path: `${OUT}/05-detail.png`, fullPage: true });

  // --- Mobile ---
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mobile.newPage();
  await mpage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("mobile: bottom nav present", await mpage.locator("nav[aria-label='Primary']").isVisible());
  check("mobile: stacked list rows", await mpage.locator("ul.divide-y > li").first().isVisible());
  await mpage.screenshot({ path: `${OUT}/06-mobile-feed.png`, fullPage: false });
  await mpage.goto(`${BASE}/status`, { waitUntil: "networkidle" });
  await mpage.screenshot({ path: `${OUT}/07-status.png`, fullPage: false });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`screenshots in ${OUT}`);
  process.exitCode = failed.length ? 1 : 0;
} finally {
  await browser.close();
}
