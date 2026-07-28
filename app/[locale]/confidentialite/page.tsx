import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { JsonLd } from "@/components/seo/json-ld";
import { getBreadcrumbSchema, SITE_URL } from "@/lib/structured-data";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "confidentialite" });
  return {
    metadataBase: new URL(SITE_URL),
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical: `${SITE_URL}/${locale}/confidentialite`,
      languages: {
        "fr-MA": `${SITE_URL}/fr/confidentialite`,
        "ar-MA": `${SITE_URL}/ar/confidentialite`,
        "x-default": `${SITE_URL}/fr/confidentialite`,
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "ar" ? "ar_MA" : "fr_MA",
      url: `${SITE_URL}/${locale}/confidentialite`,
      siteName: "Centre Soutien",
      title: t("meta_title"),
      description: t("meta_description"),
    },
    twitter: { card: "summary_large_image", title: t("meta_title") },
  };
}

const SECTIONS = ["collected", "purpose", "retention", "access", "rights"] as const;

export default async function ConfidentialitePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations("confidentialite");

  return (
    <main className="mx-auto max-w-3xl px-8 py-24">
      <JsonLd
        id="ld-breadcrumb"
        data={getBreadcrumbSchema(locale, [
          { name: "Centre Soutien", path: "" },
          { name: t("breadcrumb"), path: "/confidentialite" },
        ])}
      />
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
        {t("heading")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("updated")}</p>
      <p className="mt-6 text-lg leading-relaxed text-slate-600">{t("intro")}</p>
      <div className="mt-10 flex flex-col gap-8">
        {SECTIONS.map((key) => (
          <section key={key}>
            <h2 className="text-xl font-bold text-foreground">
              {t(`sections.${key}.title`)}
            </h2>
            <p className="mt-2 leading-relaxed text-slate-600">
              {t(`sections.${key}.body`)}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
