import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PoiProvider } from "@/components/poi/poi-provider";
import { SiteHeader } from "@/components/site-header";
import { getEnabledCities } from "@/db/queries/cities";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Basera — Rental listings from Telegram, WhatsApp & Facebook",
  description:
    "Browse house rentals scraped from social platforms and contact the poster directly on the source.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cities = await getEnabledCities();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
