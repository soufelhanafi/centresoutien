import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { StaticArticle } from "@/components/legal/static-article";
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
  const t = await getTranslations({ locale, namespace: "a_propos" });
  return {
    metadataBase: new URL(SITE_URL),
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical: `${SITE_URL}/${locale}/a-propos`,
      languages: {
        "fr-MA": `${SITE_URL}/fr/a-propos`,
        "ar-MA": `${SITE_URL}/ar/a-propos`,
        "x-default": `${SITE_URL}/fr/a-propos`,
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "ar" ? "ar_MA" : "fr_MA",
      url: `${SITE_URL}/${locale}/a-propos`,
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

const SECTIONS = ["mission", "product", "values", "contact"] as const;

export default async function AProposPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  return (
    <StaticArticle
      locale={locale}
      namespace="a_propos"
      path="/a-propos"
      sections={SECTIONS}
    />
  );
}
