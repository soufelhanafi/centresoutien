import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/structured-data";
import { Toaster } from "@/components/ui/sonner";
import "../globals.css";

// Base URL for resolving relative OG/Twitter image URLs across all routes.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

// Latin UI font, loaded on every route.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

// Arabic font. Its CSS variable is only attached to <html> on /ar routes, but
// next/font preloads every font instantiated in a layout on ALL routes sharing
// it — which was shipping this ~163 KiB face on French pages (CLAUDE.md §7.9
// violation, and the dominant cost in /fr's text LCP). `preload: false` drops
// the forced preload; since /fr never applies the family, the browser no longer
// fetches it there. On /ar the family is applied via <html>, so it still loads,
// covered by `display: swap`.
const notoArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-noto-arabic",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
  preload: false,
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Enable static rendering for this locale.
  setRequestLocale(locale);

  const isArabic = locale === "ar";
  const fontVariables = isArabic
    ? `${inter.variable} ${notoArabic.variable}`
    : inter.variable;

  return (
    <html
      lang={locale}
      dir={isArabic ? "rtl" : "ltr"}
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
