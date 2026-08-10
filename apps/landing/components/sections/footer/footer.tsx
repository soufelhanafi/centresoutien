import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// Brand/social glyphs as inline SVG: lucide-react no longer ships logo icons.
// Paths taken from the design source of truth. Decorative — labelled via the
// parent link's aria-label.
function LinkedinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="size-[15px]"
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452z" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="size-[15px]"
    >
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

// Single source of link order per column. Labels resolve from next-intl by key.
// On-page anchors point at real section ids; `#` placeholders are for pages that
// do not exist yet (routes added in later PRs).
const LINK_COLUMNS = [
  {
    key: "product",
    links: [
      { key: "features", href: "#fonctionnalites" },
      { key: "pricing", href: "#tarifs" },
      { key: "download", href: "#" }, // TODO: real route
      { key: "changelog", href: "#" }, // TODO: real route
    ],
  },
  {
    key: "resources",
    links: [
      { key: "docs", href: "#" }, // TODO: real route
      { key: "faq", href: "#faq" },
      { key: "blog", href: "#" }, // TODO: real route
    ],
  },
  {
    key: "company",
    links: [
      { key: "about", href: "#" }, // TODO: real route
      { key: "contact", href: "#contact" },
      { key: "founder", href: "#programme-fondateur" },
    ],
  },
  {
    key: "legal",
    links: [
      { key: "legal_notice", href: "#" }, // TODO: real route
      { key: "terms", href: "#" }, // TODO: real route
      { key: "privacy", href: "/confidentialite" },
      { key: "law0908", href: "#" }, // TODO: real route
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
          <div className="flex gap-3">
            <a
              href="#"
              aria-label={t("social.linkedin")}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:text-white"
            >
              <LinkedinIcon />
            </a>
            <a
              href="#"
              aria-label={t("social.youtube")}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:text-white"
            >
              <YoutubeIcon />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
