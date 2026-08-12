import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// Single source of link order per column. Labels resolve from next-intl by key.
// On-page anchors point at real section ids; `#` placeholders are for targets
// that do not exist yet — download/changelog/docs/blog (no real URLs to point
// at; inventing 404s is worse). Tracked in SOU-208/209. The social icons were
// removed in SOU-212: no LinkedIn/YouTube profiles exist, so a `#`-linked icon
// would be a dead end — they return when real channels are created.
const LINK_COLUMNS = [
  {
    key: "product",
    links: [
      { key: "features", href: "#fonctionnalites" },
      { key: "pricing", href: "#tarifs" },
      { key: "download", href: "#" }, // TODO: real route (SOU-202)
      { key: "changelog", href: "#" }, // TODO: real route (SOU-202)
    ],
  },
  {
    key: "resources",
    links: [
      { key: "docs", href: "#" }, // TODO: real route (SOU-202)
      { key: "faq", href: "#faq" },
      { key: "blog", href: "#" }, // TODO: real route (SOU-202)
    ],
  },
  {
    key: "company",
    links: [
      { key: "about", href: "/a-propos" },
      { key: "contact", href: "#contact" },
      { key: "founder", href: "#programme-fondateur" },
    ],
  },
  {
    key: "legal",
    links: [
      { key: "legal_notice", href: "/mentions-legales" },
      { key: "terms", href: "/cgv" },
      { key: "privacy", href: "/confidentialite" },
      { key: "law0908", href: "/loi-09-08" },
    ],
  },
] as const;

export async function Footer() {
  const t = await getTranslations("footer");

  return (
    <footer className="bg-slate-900 px-8 pb-7 pt-16 text-slate-300">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <a href="#" className="flex items-center gap-2.5 text-white">
              <span
                aria-hidden="true"
                className="inline-flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-500 text-[15px] font-bold tracking-tight text-white"
              >
                CS
              </span>
              <span className="text-[17px] font-bold tracking-tight text-white">
                {t("brand")}
              </span>
            </a>
            <p className="mt-3.5 max-w-[260px] text-[13.5px] text-slate-400">
              {t("tagline")}
            </p>
          </div>

          {LINK_COLUMNS.map((column) => (
            <div key={column.key}>
              <h2 className="mb-3.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                {t(`columns.${column.key}.title`)}
              </h2>
              <nav className="flex flex-col gap-2.5 text-sm">
                {column.links.map((link) => {
                  const label = t(`columns.${column.key}.links.${link.key}`);
                  const cls =
                    "text-slate-300 transition-colors hover:text-white";
                  return link.href.startsWith("/") ? (
                    <Link key={link.key} href={link.href} className={cls}>
                      {label}
                    </Link>
                  ) : (
                    <a key={link.key} href={link.href} className={cls}>
                      {label}
                    </a>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-[22px] text-[13px] text-slate-500">
          <div>{t("copyright")}</div>
        </div>
      </div>
    </footer>
  );
}
