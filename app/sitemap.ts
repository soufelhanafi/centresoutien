import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/structured-data";

// Reciprocal hreflang alternates for the homepage, shared across every entry.
const languageAlternates = {
  "fr-MA": `${SITE_URL}/fr`,
  "ar-MA": `${SITE_URL}/ar`,
};

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routing.locales.map((locale) => ({
    url: `${SITE_URL}/${locale}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 1,
    alternates: {
      languages: languageAlternates,
    },
  }));
}
