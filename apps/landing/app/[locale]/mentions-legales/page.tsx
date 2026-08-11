import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { LegalArticle } from "@/components/legal/legal-article";
import { SITE_URL } from "@/lib/structured-data";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "mentions_legales" });
  return {
    metadataBase: new URL(SITE_URL),
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical: `${SITE_URL}/${locale}/mentions-legales`,
      languages: {
        "fr-MA": `${SITE_URL}/fr/mentions-legales`,
        "ar-MA": `${SITE_URL}/ar/mentions-legales`,
        "x-default": `${SITE_URL}/fr/mentions-legales`,
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "ar" ? "ar_MA" : "fr_MA",
      url: `${SITE_URL}/${locale}/mentions-legales`,
      siteName: "Centre Soutien",
      title: t("meta_title"),
      description: t("meta_description"),
      images: [
        {
          url: `${SITE_URL}/${locale}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: "Centre Soutien",
        },
      ],
    },
    twitter: { card: "summary_large_image", title: t("meta_title") },
  };
}

const SECTIONS = ["editor", "host", "ip", "contact"] as const;

export default async function MentionsLegalesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  return (
    <LegalArticle
      locale={locale}
      namespace="mentions_legales"
      path="/mentions-legales"
      sections={SECTIONS}
    />
  );
}
