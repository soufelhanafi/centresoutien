"use client";

// Client island: the FR/AR switch is the only interactive part of the header.
// It swaps the active locale while preserving the current path, via next-intl's
// locale-aware router.
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("header.language");

  const switchTo = (next: Locale) => {
    if (next === locale) return;
    router.replace(pathname, { locale: next });
  };

  const labels: Record<Locale, string> = {
    fr: "FR",
    ar: "ع",
  };

  return (
    <div
      role="group"
      aria-label={t("aria")}
      className="inline-flex items-center rounded-lg bg-muted p-[3px] text-[12.5px] font-semibold"
    >
      {routing.locales.map((code) => {
        const isActive = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => switchTo(code)}
            aria-pressed={isActive}
            aria-label={t(code === "ar" ? "arabic" : "french")}
            className={cn(
              "rounded-md px-2.5 py-1 transition-colors",
              code === "ar" && "font-arabic",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[code]}
          </button>
        );
      })}
    </div>
  );
}
