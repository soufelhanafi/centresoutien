import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // No trailing slash — SEO policy (CLAUDE.md §7.6).
  trailingSlash: false,
  images: {
    // AVIF first, WebP fallback (CLAUDE.md §7.8).
    formats: ["image/avif", "image/webp"],
  },
};

export default withNextIntl(nextConfig);
