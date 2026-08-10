import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { NAV_LINKS } from "./nav-links";
import { LanguageToggle } from "./language-toggle";
import { MobileNav } from "./mobile-nav";

export async function Header() {
  const t = await getTranslations("header");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex max-w-[1200px] items-center gap-8 px-8 py-3.5">
        <Link
          href="/"
          aria-label={t("home_aria")}
          className="flex items-center gap-2.5"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-500 text-[15px] font-bold tracking-tight text-white"
          >
            {t("logo_mark")}
          </span>
          <span className="text-[17px] font-bold tracking-tight text-foreground">
            {t("brand")}
          </span>
        </Link>

        <nav
          aria-label={t("nav_aria")}
          className="mx-auto hidden items-center gap-7 text-[14.5px] font-medium text-slate-700 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="transition-colors hover:text-primary"
            >
              {t(`nav.${link.key}`)}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 md:flex">
          <LanguageToggle />
          <Button variant="primary" size="sm">
            <Download aria-hidden="true" />
            {t("cta.download")}
          </Button>
        </div>

        <MobileNav />
      </div>
    </header>
  );
}
