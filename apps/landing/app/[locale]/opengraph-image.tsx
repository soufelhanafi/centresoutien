import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

// Static per-locale OG image, generated at build time. Self-contained: inline
// styles + the default font only, so it never reaches out to a remote host.
//
// The card shows the Latin brand wordmark (identical in both locales) plus the
// domain. We deliberately avoid rendering the localized title here because
// next/og (Satori) cannot shape Arabic script without a bundled Arabic font;
// a localized Arabic tagline is a follow-up that would ship such a font.
export const dynamic = "force-static";
export const alt = "Centre Soutien";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "header" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "96px",
          background:
            "linear-gradient(135deg, #0F766E 0%, #134E4A 55%, #0f172a 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #5eead4, #14b8a6)",
            }}
          />
          <div style={{ fontSize: "96px", fontWeight: 800, letterSpacing: "-0.03em" }}>
            {t("brand")}
          </div>
        </div>
        <div style={{ fontSize: "30px", fontWeight: 600, color: "#99f6e4" }}>
          centresoutien.com
        </div>
      </div>
    ),
    size,
  );
}
