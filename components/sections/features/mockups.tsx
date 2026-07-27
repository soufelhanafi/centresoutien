import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Search, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Decorative, fully-localized product previews — one per feature row. Each is
// exposed to assistive tech as a single labelled image (role="img" + aria-label)
// so screen readers get a summary, not the noise of the fake UI. Every numeric,
// currency, time or date value is wrapped in dir="ltr" so it stays left-to-right
// inside the RTL (Arabic) layout. All copy flows through next-intl.

// --- shared window shell ------------------------------------------------------

type ShellProps = {
  ariaLabel: string;
  children: ReactNode;
  badge?: string;
  dir?: "rtl";
  className?: string;
};

function MockupShell({ ariaLabel, children, badge, dir, className }: ShellProps) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      dir={dir}
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_40px_-20px_rgba(15,23,42,0.14)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-slate-50 px-3 py-2.5">
        <span className="size-2.5 rounded-full bg-red-500" />
        <span className="size-2.5 rounded-full bg-amber-500" />
        <span className="size-2.5 rounded-full bg-emerald-500" />
        {badge ? (
          <span className="ms-auto text-[10px] font-semibold text-muted-foreground">
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

// --- 01 · Rooms ---------------------------------------------------------------

const ROOMS = [
  { key: "0", tone: "free" },
  { key: "1", tone: "busy" },
  { key: "2", tone: "free" },
  { key: "3", tone: "soon" },
] as const;

const ROOM_STATUS_TONE: Record<"free" | "busy" | "soon", string> = {
  free: "text-emerald-500",
  busy: "text-red-500",
  soon: "text-amber-500",
};

export async function RoomsMockup() {
  const t = await getTranslations("features.items.rooms.mockup");

  return (
    <MockupShell ariaLabel={t("aria")}>
      <div className="p-5">
        <div className="mb-3.5 flex items-center justify-between gap-2">
          <div className="text-[15px] font-bold text-foreground">
            {t("title")}
          </div>
          <div className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground">
            {t("action")}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {ROOMS.map(({ key, tone }) => (
            <div key={key} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[13.5px] font-bold text-foreground">
                  {t(`rooms.${key}.name`)}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[10px] font-semibold",
                    ROOM_STATUS_TONE[tone],
                  )}
                >
                  ● {t(`rooms.${key}.status`)}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                <span dir="ltr">{t(`rooms.${key}.capacity`)}</span> {t("places")}{" "}
                · {t(`rooms.${key}.equip`)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  );
}

// --- 02 · Planning ------------------------------------------------------------

const PLANNING_DAYS = ["0", "1", "2", "3", "4", "5"] as const;

const SESSIONS = [
  { key: "0", tone: "teal" },
  { key: "1", tone: "amber" },
  { key: "2", tone: "conflict" },
  { key: "3", tone: "violet" },
] as const;

const SESSION_CHIP: Record<"teal" | "amber" | "violet" | "conflict", string> = {
  teal: "border-s-[3px] border-s-primary bg-teal-100 text-teal-900",
  amber: "border-s-[3px] border-s-amber-600 bg-amber-200 text-amber-900",
  violet: "border-s-[3px] border-s-violet-600 bg-violet-100 text-violet-900",
  conflict: "border border-dashed border-red-500 bg-red-100 text-red-800",
};

export async function PlanningMockup() {
  const t = await getTranslations("features.items.planning.mockup");

  return (
    <MockupShell ariaLabel={t("aria")}>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-[14px] font-bold text-foreground">
            {t("title")}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ChevronLeft aria-hidden="true" className="size-3.5 rtl:rotate-180" />
            <span>{t("range")}</span>
            <ChevronRight aria-hidden="true" className="size-3.5 rtl:rotate-180" />
          </div>
        </div>

        <div className="mb-3 grid grid-cols-6 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
          {PLANNING_DAYS.map((day) => (
            <span key={day}>{t(`days.${day}`)}</span>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          {SESSIONS.map(({ key, tone }) => (
            <div key={key} className="flex items-center gap-2.5">
              <span
                dir="ltr"
                className="w-9 shrink-0 text-[11px] font-medium text-slate-400"
              >
                {t(`sessions.${key}.time`)}
              </span>
              <span
                className={cn(
                  "flex flex-1 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold",
                  SESSION_CHIP[tone],
                )}
              >
                {tone === "conflict" ? (
                  <TriangleAlert
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                  />
                ) : null}
                {t(`sessions.${key}.label`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  );
}

// --- 03 · Teachers ------------------------------------------------------------

const AVAILABILITY = [
  { key: "0", off: false },
  { key: "1", off: false },
  { key: "2", off: true },
  { key: "3", off: false },
  { key: "4", off: false },
  { key: "5", off: false },
] as const;

const TEACHER_TAGS = ["0", "1", "2"] as const;

export async function TeachersMockup() {
  const t = await getTranslations("features.items.teachers.mockup");

  return (
    <MockupShell ariaLabel={t("aria")}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-teal-500 text-[18px] font-bold text-white">
            <span dir="ltr">{t("initials")}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold text-foreground">
              {t("name")}
            </div>
            <div className="text-[12px] text-muted-foreground">{t("role")}</div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              {TEACHER_TAGS.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-teal-50 px-2 py-0.5 text-primary"
                >
                  {t(`tags.${tag}`)}
                </span>
              ))}
            </div>
          </div>
          <div className="shrink-0 text-end">
            <div className="text-[18px] font-extrabold text-foreground">
              <span dir="ltr">{t("rate")}</span>{" "}
              <span className="text-[10px] font-medium text-muted-foreground">
                {t("rateUnit")}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {t("rateLabel")}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {t("availabilityLabel")}
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1 text-center text-[10px]">
            {AVAILABILITY.map(({ key, off }) => (
              <div key={key}>
                <div className="mb-1 text-muted-foreground">
                  {t(`availability.${key}.day`)}
                </div>
                <div
                  className={cn(
                    "rounded py-1.5 font-medium",
                    off
                      ? "bg-slate-100 text-slate-400"
                      : "bg-primary text-white",
                  )}
                >
                  <span dir="ltr">{t(`availability.${key}.hours`)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockupShell>
  );
}

// --- 04 · Students ------------------------------------------------------------

const STUDENT_ROWS = [
  { key: "0", attendance: "ok", balance: "ok" },
  { key: "1", attendance: "ok", balance: "ok" },
  { key: "2", attendance: "warn", balance: "danger" },
  { key: "3", attendance: "ok", balance: "ok" },
] as const;

const ATTENDANCE_TONE: Record<"ok" | "warn", string> = {
  ok: "text-emerald-500",
  warn: "text-amber-500",
};

const BALANCE_TONE: Record<"ok" | "danger", string> = {
  ok: "text-emerald-500",
  danger: "text-red-500",
};

export async function StudentsMockup() {
  const t = await getTranslations("features.items.students.mockup");

  return (
    <MockupShell ariaLabel={t("aria")}>
      <div className="p-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="text-[14px] font-bold text-foreground">
            {t("title")}{" "}
            <span className="font-medium text-muted-foreground">
              · <span dir="ltr">{t("count")}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-teal-50 px-2 py-1 text-[11px] font-semibold text-primary">
            <Search aria-hidden="true" className="size-3" />
            {t("search")}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border text-[12px]">
          <div className="grid grid-cols-[1.5fr_1fr_0.7fr_0.8fr] gap-1 border-b border-border bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            <span>{t("columns.name")}</span>
            <span>{t("columns.level")}</span>
            <span>{t("columns.attendance")}</span>
            <span>{t("columns.balance")}</span>
          </div>
          {STUDENT_ROWS.map(({ key, attendance, balance }, index) => (
            <div
              key={key}
              className={cn(
                "grid grid-cols-[1.5fr_1fr_0.7fr_0.8fr] items-center gap-1 px-3 py-2",
                index < STUDENT_ROWS.length - 1 && "border-b border-slate-100",
              )}
            >
              <span className="truncate font-semibold text-foreground">
                {t(`rows.${key}.name`)}
              </span>
              <span className="truncate text-muted-foreground">
                {t(`rows.${key}.level`)}
              </span>
              <span
                dir="ltr"
                className={cn("font-semibold text-start", ATTENDANCE_TONE[attendance])}
              >
                {t(`rows.${key}.attendance`)}
              </span>
              <span
                className={cn("font-semibold", BALANCE_TONE[balance])}
              >
                {t(`rows.${key}.balance`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  );
}

// --- 05 · Billing -------------------------------------------------------------

const INVOICE_LINES = ["0", "1"] as const;

export async function BillingMockup() {
  const t = await getTranslations("features.items.billing.mockup");

  return (
    <MockupShell ariaLabel={t("aria")}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("label")}
            </div>
            <div className="mt-0.5 text-[17px] font-extrabold text-foreground">
              N° <span dir="ltr">{t("number")}</span>
            </div>
          </div>
          <div className="text-end text-[11px] text-muted-foreground">
            <div>
              {t("issuedLabel")} <span dir="ltr">{t("issuedDate")}</span>
            </div>
            <div>
              {t("dueLabel")} <span dir="ltr">{t("dueDate")}</span>
            </div>
          </div>
        </div>

        <div className="mt-3.5 rounded-lg bg-slate-50 p-3 text-[12px]">
          <div className="text-muted-foreground">{t("billedTo")}</div>
          <div className="mt-0.5 font-bold text-foreground">{t("client")}</div>
          <div className="text-muted-foreground">{t("clientDetail")}</div>
        </div>

        <div className="mt-3.5 text-[12px]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-100 py-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            <span>{t("columns.item")}</span>
            <span className="text-end">{t("columns.hours")}</span>
            <span className="text-end">{t("columns.total")}</span>
          </div>
          {INVOICE_LINES.map((line) => (
            <div
              key={line}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 py-2"
            >
              <span className="text-foreground">{t(`lines.${line}.item`)}</span>
              <span dir="ltr" className="text-end text-muted-foreground">
                {t(`lines.${line}.hours`)}
              </span>
              <span dir="ltr" className="text-end font-semibold text-foreground">
                {t(`lines.${line}.total`)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3">
            <span className="font-bold text-foreground">{t("totalLabel")}</span>
            <span dir="ltr" className="text-[17px] font-extrabold text-primary">
              {t("totalValue")}
            </span>
          </div>
        </div>
      </div>
    </MockupShell>
  );
}

// --- 06 · Bilingual -----------------------------------------------------------

const BILINGUAL_ROWS = ["0", "1", "2"] as const;

type LangPanelProps = {
  ariaLabel: string;
  badge: string;
  title: string;
  count: string;
  rows: ReadonlyArray<{ name: string; level: string }>;
  dir?: "rtl";
};

function LangPanel({ ariaLabel, badge, title, count, rows, dir }: LangPanelProps) {
  return (
    <MockupShell ariaLabel={ariaLabel} badge={badge} dir={dir}>
      <div className="p-3.5">
        <div className="text-[13px] font-bold text-foreground">{title}</div>
        <div className="mb-2.5 text-[11px] text-muted-foreground">
          <span dir="ltr">{count}</span>
        </div>
        <div className="flex flex-col gap-1.5 text-[11.5px]">
          {rows.map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5"
            >
              <span className="truncate font-semibold text-foreground">
                {row.name}
              </span>
              <span className="shrink-0 font-semibold text-primary">
                {row.level}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  );
}

export async function BilingualMockup() {
  const t = await getTranslations("features.items.bilingual.mockup");

  const frRows = BILINGUAL_ROWS.map((row) => ({
    name: t(`fr.rows.${row}.name`),
    level: t(`fr.rows.${row}.level`),
  }));
  const arRows = BILINGUAL_ROWS.map((row) => ({
    name: t(`ar.rows.${row}.name`),
    level: t(`ar.rows.${row}.level`),
  }));

  return (
    <div className="grid grid-cols-2 gap-3.5">
      <LangPanel
        ariaLabel={t("ariaFr")}
        badge={t("badgeFr")}
        title={t("fr.title")}
        count={t("fr.count")}
        rows={frRows}
      />
      <LangPanel
        ariaLabel={t("ariaAr")}
        badge={t("badgeAr")}
        title={t("ar.title")}
        count={t("ar.count")}
        rows={arRows}
        dir="rtl"
      />
    </div>
  );
}
