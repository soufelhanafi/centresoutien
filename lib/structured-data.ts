import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

/** Canonical production origin. Keep in sync with app metadata + sitemap/robots. */
export const SITE_URL = "https://centresoutien.com";

/** Maps our app locales to BCP-47 tags used by Schema.org `inLanguage`. */
const IN_LANGUAGE: Record<Locale, string> = {
  fr: "fr-MA",
  ar: "ar-MA",
};

type OrganizationSchema = {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: string;
  url: string;
  logo: string;
  sameAs: string[];
};

type Offer = {
  "@type": "Offer";
  name: string;
  price: string;
  priceCurrency: "MAD";
  category: string;
};

type SoftwareApplicationSchema = {
  "@context": "https://schema.org";
  "@type": "SoftwareApplication";
  name: string;
  applicationCategory: "BusinessApplication";
  operatingSystem: string;
  inLanguage: string;
  offers: Offer[];
};

type WebSiteSchema = {
  "@context": "https://schema.org";
  "@type": "WebSite";
  name: string;
  url: string;
  inLanguage: string;
};

/**
 * Pricing tiers, sourced from the design file
 * `html-design/Centre Soutien Landing.dc.html` (lines 517–604).
 * All three tiers are fixed annual prices in MAD — none is "on demand".
 */
const PRICING_TIERS: ReadonlyArray<{ name: string; price: string }> = [
  { name: "Essentiel", price: "1490" },
  { name: "Pro", price: "3490" },
  { name: "Premium", price: "6490" },
];

export function getOrganizationSchema(): OrganizationSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Centre Soutien",
    url: SITE_URL,
    // TODO: replace with a real branded logo asset (e.g. /og/logo.png) once available.
    logo: `${SITE_URL}/favicon.ico`,
    // TODO: add real social profile URLs (do not invent ones that 404).
    sameAs: [],
  };
}

export function getSoftwareApplicationSchema(
  locale: Locale,
): SoftwareApplicationSchema {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Centre Soutien",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Windows, macOS",
    inLanguage: IN_LANGUAGE[locale],
    offers: PRICING_TIERS.map((tier) => ({
      "@type": "Offer",
      name: tier.name,
      price: tier.price,
      priceCurrency: "MAD",
      category: "annual",
    })),
  };
}

export function getWebSiteSchema(locale: Locale): WebSiteSchema {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Centre Soutien",
    url: `${SITE_URL}/${locale}`,
    inLanguage: IN_LANGUAGE[locale],
  };
}

/**
 * FAQ item keys, in display order. Must stay in sync with the visible FAQ
 * section (`faq.items.*` messages) so the FAQPage rich result mirrors the page.
 */
const FAQ_KEYS = [
  "offline",
  "storage",
  "updates",
  "multi_center",
  "support",
  "trial",
  "refund",
  "training",
] as const;

type FaqPageSchema = {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: { "@type": "Answer"; text: string };
  }>;
};

export async function getFaqPageSchema(locale: Locale): Promise<FaqPageSchema> {
  const t = await getTranslations({ locale, namespace: "faq.items" });
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_KEYS.map((key) => ({
      "@type": "Question",
      name: t(`${key}.question`),
      acceptedAnswer: {
        "@type": "Answer",
        text: t(`${key}.answer`),
      },
    })),
  };
}

type BreadcrumbSchema = {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }>;
};

/** Breadcrumb trail for interior pages. `items` are ordered [root, …, current]. */
export function getBreadcrumbSchema(
  locale: Locale,
  items: ReadonlyArray<{ name: string; path: string }>,
): BreadcrumbSchema {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: `${SITE_URL}/${locale}${entry.path}`,
    })),
  };
}
