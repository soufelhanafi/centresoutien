import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Check, ShieldCheck, WifiOff, Globe } from "lucide-react";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/sections/header";
import { Footer } from "@/components/sections/footer";
import { DownloadCards } from "@/components/download/download-cards";
import { DashboardMockup } from "@/components/sections/hero/dashboard-mockup";
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
  const t = await getTranslations({ locale, namespace: "download" });
  return {
    metadataBase: new URL(SITE_URL),
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical: `${SITE_URL}/${locale}/telechargement`,
      languages: {
        "fr-MA": `${SITE_URL}/fr/telechargement`,
        "ar-MA": `${SITE_URL}/ar/telechargement`,
        "x-default": `${SITE_URL}/fr/telechargement`,
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "ar" ? "ar_MA" : "fr_MA",
      url: `${SITE_URL}/${locale}/telechargement`,
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

const TRUST_ITEMS = ["offline", "local_data", "updates"] as const;

export default async function DownloadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "download" });

  const trustIcons = {
    offline: WifiOff,
    local_data: ShieldCheck,
    updates: Globe,
  } as const;

  return (
    <>
      <JsonLd
        id="ld-download-breadcrumb"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Centre Soutien", item: `${SITE_URL}/${locale}` },
            { "@type": "ListItem", position: 2, name: t("breadcrumb"), item: `${SITE_URL}/${locale}/telechargement` },
          ],
        }}
      />
      <Header />
      <main>
        {/* Hero */}
        <section className="bg-gradient-to-b from-teal-50/60 to-background">
          <div className="mx-auto max-w-[1200px] px-8 pb-20 pt-16 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-[13px] font-semibold text-primary">
              {t("badge")}
            </span>
            <h1 className="mx-auto mt-5 max-w-2xl text-[clamp(2.25rem,5vw,3.25rem)] font-extrabold leading-[1.08] tracking-tight text-foreground">
              {t("heading")}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
              {t("subheading")}
            </p>
            <div className="mx-auto mt-10 max-w-[900px]">
              <DownloadCards />
            </div>
            <ul className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-3 text-[13.5px] text-muted-foreground">
              {TRUST_ITEMS.map((item) => {
                const Icon = trustIcons[item];
                return (
                  <li key={item} className="inline-flex items-center gap-2">
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    {t(`trust.${item}`)}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* App preview */}
        <section className="border-t border-border bg-card/40 py-20">
          <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-8 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
                {t("preview.eyebrow")}
              </p>
              <h2 className="mt-2.5 text-[clamp(1.75rem,3.5vw,2.375rem)] font-extrabold leading-[1.12] tracking-tight text-foreground">
                {t("preview.heading")}
              </h2>
              <p className="mt-3.5 text-lg leading-relaxed text-slate-600">
                {t("preview.subheading")}
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {(["bilingual", "invoices", "planning"] as const).map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                    <span className="text-sm leading-relaxed text-slate-700">
                      {t(`preview.${item}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <DashboardMockup />
          </div>
        </section>

        {/* Install steps */}
        <section className="bg-background py-20">
          <div className="mx-auto max-w-[1000px] px-8">
            <h2 className="text-center text-[clamp(1.75rem,3.5vw,2.375rem)] font-extrabold tracking-tight text-foreground">
              {t("steps.heading")}
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {(["one", "two", "three"] as const).map((step, index) => (
                <div key={step} className="relative rounded-2xl border border-border bg-card p-6">
                  <span className="absolute -top-4 start-6 flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-2 text-lg font-bold text-foreground">
                    {t(`steps.${step}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {t(`steps.${step}.body`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Requirements */}
        <section className="border-t border-border bg-slate-50 py-20">
          <div className="mx-auto max-w-[1000px] px-8">
            <h2 className="text-center text-[clamp(1.75rem,3.5vw,2.375rem)] font-extrabold tracking-tight text-foreground">
              {t("requirements.heading")}
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {(["mac", "windows", "offline"] as const).map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-card p-6">
                  <Check aria-hidden="true" className="size-5 text-primary" />
                  <h3 className="mt-3 font-bold text-foreground">
                    {t(`requirements.${item}.title`)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {t(`requirements.${item}.body`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
