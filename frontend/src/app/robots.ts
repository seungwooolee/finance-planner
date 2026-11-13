import type { MetadataRoute } from "next";

// Pre-announcement entry: keep the whole site out of search results.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
