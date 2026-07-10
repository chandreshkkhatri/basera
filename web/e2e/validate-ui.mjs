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
    permissions: ["geolocation"],
  });
  const page = await desktop.newPage();

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const htmlClass = await page.locator("html").getAttribute("class");
  check("default theme is dark", (htmlClass ?? "").includes("dark"), htmlClass ?? "");
  check("list view is default", await page.locator("ul.divide-y > li").first().isVisible());
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

  // --- Detail page ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const firstHref = await page.locator("a[href^='/listings/']").first().getAttribute("href");
  await page.goto(`${BASE}${firstHref}`, { waitUntil: "networkidle" });
  check("detail: has h1 rent heading", await page.locator("h1").first().isVisible());
  check("detail: has media banner", await page.locator(".aspect-2\\/1, [class*='aspect-2']").first().isVisible());
  await page.screenshot({ path: `${OUT}/05-detail.png`, fullPage: true });

  // --- Mobile ---
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mobile.newPage();
  await mpage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("mobile: bottom nav present", await mpage.locator("nav[aria-label='Primary']").isVisible());
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
