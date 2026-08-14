import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/sections/header";
import { Footer } from "@/components/sections/footer";
import { JsonLd } from "@/components/seo/json-ld";
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
  const t = await getTranslations({ locale, namespace: "blog" });
  return {
    metadataBase: new URL(SITE_URL),
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical: `${SITE_URL}/${locale}/blog`,
      languages: {
        "fr-MA": `${SITE_URL}/fr/blog`,
        "ar-MA": `${SITE_URL}/ar/blog`,
        "x-default": `${SITE_URL}/fr/blog`,
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "ar" ? "ar_MA" : "fr_MA",
      url: `${SITE_URL}/${locale}/blog`,
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

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "blog" });

  return (
    <>
      <JsonLd
        id="ld-blog-breadcrumb"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Centre Soutien", item: `${SITE_URL}/${locale}` },
            { "@type": "ListItem", position: 2, name: t("breadcrumb"), item: `${SITE_URL}/${locale}/blog` },
          ],
        }}
      />
      <Header />
      <main>
        <section className="mx-auto max-w-[800px] px-8 py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-[13px] font-semibold text-primary">
            {t("badge")}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-foreground">
            {t("heading")}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            {t("intro")}
          </p>
          <div className="mt-12 rounded-2xl border border-dashed border-slate-300 p-10 text-center">
            <p className="text-slate-600">{t("empty")}</p>
            <Link
              href="/nouveautes"
              className="mt-4 inline-flex text-sm font-semibold text-primary hover:text-teal-700"
            >
              {t("changelog_link")}
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
