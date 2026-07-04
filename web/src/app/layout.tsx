import type { Metadata } from "next";
import "./globals.css";
import { PoiProvider } from "@/components/poi/poi-provider";
import { SiteHeader } from "@/components/site-header";
import { getEnabledCities } from "@/db/queries/cities";

export const metadata: Metadata = {
  title: "Basera - Rental listings from Facebook groups",
  description:
    "Browse house rentals scraped from Facebook groups and contact the poster directly on the source.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The shell renders even if the DB is briefly unavailable (or absent during
  // a build-time prerender): the city selector just shows nothing.
  const cities = await getEnabledCities().catch(() => []);
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PoiProvider>
          <SiteHeader cities={cities} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
            {children}
          </main>
        </PoiProvider>
      </body>
    </html>
  );
}
