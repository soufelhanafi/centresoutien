import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/structured-data";

// Public routes (path suffix appended after the `/{locale}` prefix).
const ROUTES = [
  { path: "", changeFrequency: "weekly" as const, priority: 1 },
  { path: "/confidentialite", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/mentions-legales", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/cgv", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/loi-09-08", changeFrequency: "yearly" as const, priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return ROUTES.flatMap((route) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${route.path}`,
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
      alternates: {
        languages: {
          "fr-MA": `${SITE_URL}/fr${route.path}`,
          "ar-MA": `${SITE_URL}/ar${route.path}`,
        },
      },
    })),
  );
}
