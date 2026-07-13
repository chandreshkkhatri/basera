import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Operator surfaces and the JSON API aren't for crawlers.
      disallow: ["/admin", "/api/", "/status"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
