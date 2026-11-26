import type { MetadataRoute } from "next";

import { env } from "@/env";

/** Crawlers may read public pages; the app's private areas and API are off limits. Hidden tracks are also `noindex` on their own pages. */
export default function robots(): MetadataRoute.Robots {
  const base = env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/settings", "/studio", "/you", "/notifications", "/feed", "/embed/", "/upload", "/search"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
