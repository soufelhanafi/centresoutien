import { getTranslations } from "next-intl/server";
import {
  CalendarDays,
  CreditCard,
  GraduationCap,
  Home,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Decorative product preview: a faithful, fully-localized recreation of the
// desktop app dashboard. Exposed to assistive tech as a single labelled image
// (role="img" + aria-label) so screen readers get a summary, not the noise of
// the fake UI. Numeric/currency/time values are wrapped in dir="ltr" so they
// stay left-to-right inside the RTL (Arabic) layout.

const NAV_ITEMS: ReadonlyArray<{ key: string; Icon: LucideIcon }> = [
  { key: "dashboard", Icon: LayoutDashboard },
  { key: "planning", Icon: CalendarDays },
  { key: "students", Icon: Users },
  { key: "teachers", Icon: GraduationCap },
  { key: "rooms", Icon: Home },
  { key: "invoices", Icon: CreditCard },
];

const STAT_CARDS: ReadonlyArray<{
  key: string;
  hasUnit?: boolean;
  valueTone?: "danger";
  deltaTone: "positive" | "muted";
}> = [
  { key: "students", deltaTone: "positive" },
  { key: "teachers", deltaTone: "muted" },
  { key: "revenue", hasUnit: true, deltaTone: "positive" },
  { key: "unpaid", valueTone: "danger", deltaTone: "muted" },
];

const TABLE_ROWS = ["one", "two", "three"] as const;

export async function DashboardMockup() {
  const t = await getTranslations("hero.mockup");

  return (
    <div
      role="img"
      aria-label={t("aria")}
      className="mx-auto w-full max-w-lg -rotate-[1.2deg] [filter:drop-shadow(0_30px_50px_rgba(15,23,42,0.18))] lg:max-w-none"
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {/* window title bar */}
        <div className="flex items-center gap-2 border-b border-border bg-slate-50 px-3.5 py-2.5">
          <span className="size-3 rounded-full bg-red-500" />
          <span className="size-3 rounded-full bg-amber-500" />
          <span className="size-3 rounded-full bg-emerald-500" />
          <span className="mx-auto text-xs font-medium text-muted-foreground">
            {t("window_title")}
          </span>
        </div>

        {/* window body */}
        <div className="grid grid-cols-[144px_1fr] sm:grid-cols-[168px_1fr]">
          {/* sidebar */}
          <div className="border-e border-border bg-slate-50 p-2.5 text-[12.5px]">
            <div className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              {t("center_name")}
            </div>
            <nav className="mt-1.5 flex flex-col gap-0.5">
              {NAV_ITEMS.map(({ key, Icon }, index) => (
                <span
                  key={key}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-[7px]",
                    index === 0
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "text-slate-600",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{t(`nav.${key}`)}</span>
                </span>
              ))}
            </nav>
          </div>

          {/* main panel */}
          <div className="min-w-0 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-foreground">
                  {t("greeting")}
                </div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                  {t("date_line")}
                </div>
              </div>
              <div className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                <span className="text-emerald-500">●</span> {t("sync")}
              </div>
            </div>

            {/* stat cards */}
            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
              {STAT_CARDS.map(({ key, hasUnit, valueTone, deltaTone }) => (
                <div key={key} className="rounded-lg border border-border p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(`stats.${key}.label`)}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-lg font-bold",
                      valueTone === "danger"
                        ? "text-red-500"
                        : "text-foreground",
                    )}
                  >
                    <span dir="ltr">{t(`stats.${key}.value`)}</span>
                    {hasUnit ? (
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {" "}
                        {t(`stats.${key}.unit`)}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "text-[10px]",
                      deltaTone === "positive"
                        ? "text-emerald-500"
                        : "text-muted-foreground",
                    )}
                  >
                    {t(`stats.${key}.delta`)}
                  </div>
                </div>
              ))}
            </div>

            {/* upcoming sessions table */}
            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <div className="flex items-center justify-between border-b border-border bg-slate-50 px-3 py-2 text-[11.5px] font-semibold text-slate-700">
                <span>{t("table.title")}</span>
                <span className="text-[10.5px] font-medium text-muted-foreground">
                  {t("table.today")}
                </span>
              </div>
              <div className="text-[11.5px]">
                {TABLE_ROWS.map((row, index) => {
                  const detail = t(`table.rows.${row}.detail`);
                  return (
                    <div
                      key={row}
                      className={cn(
                        "grid grid-cols-[46px_1fr_auto_auto] items-center gap-2 px-3 py-2",
                        index < TABLE_ROWS.length - 1 &&
                          "border-b border-slate-100",
                      )}
                    >
                      <span dir="ltr" className="font-medium text-muted-foreground">
                        {t(`table.rows.${row}.time`)}
                      </span>
                      <span className="truncate">
                        <span className="font-semibold text-foreground">
                          {t(`table.rows.${row}.name`)}
                        </span>
                        {detail ? (
                          <span className="text-muted-foreground">
                            {" · "}
                            {detail}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground">
                        {t(`table.rows.${row}.room`)}
                      </span>
                      <span dir="ltr" className="font-semibold text-foreground">
                        {t(`table.rows.${row}.price`)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
