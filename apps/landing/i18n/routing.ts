import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // French is the default and the source of truth; Arabic is the RTL counterpart.
  locales: ["fr", "ar"],
  defaultLocale: "fr",
  // Always prefix so every locale has a distinct, crawlable URL (/fr, /ar) for hreflang.
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
