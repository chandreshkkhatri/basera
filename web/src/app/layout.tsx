import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { PoiProvider } from "@/components/poi/poi-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getEnabledCities } from "@/db/queries/cities";
import { siteUrl } from "@/lib/site";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "Basera — Rooms & rentals near you",
    // Child pages set just their own part; the brand rides along.
    template: "%s | Basera",
  },
  description:
    "Browse house rentals aggregated from Facebook, Telegram and WhatsApp groups, sorted by distance from your point, and contact the poster directly.",
  openGraph: {
    siteName: "Basera",
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#2a2233" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

// Applied before first paint so a light-mode preference doesn't flash the
// default dark theme. Default (no stored preference) is dark — the hero theme.
const THEME_INIT = `try{var t=localStorage.getItem('basera:theme');if(t==='light')document.documentElement.classList.remove('dark');else document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}`;

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
      className={`dark h-full antialiased ${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PoiProvider>
          <SiteHeader cities={cities} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
            {children}
          </main>
          {/* pb clears the fixed BottomNav on mobile. */}
          <div className="pb-14 sm:pb-0">
            <SiteFooter />
          </div>
          <BottomNav />
        </PoiProvider>
      </body>
    </html>
  );
}
