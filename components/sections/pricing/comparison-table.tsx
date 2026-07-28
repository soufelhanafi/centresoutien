import { getTranslations } from "next-intl/server";

// Detailed 7-row feature comparison across the three tiers. Built as a CSS grid
// (not a <table>) to match the design; each cell value is a short string or one
// of the "✓" / "—" markers stored in the messages. Numeric cells are wrapped in
// `dir="ltr"` so figures stay left-to-right under Arabic.

const ROW_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;
const TIER_COLS = ["essentiel", "pro", "premium"] as const;

export async function ComparisonTable() {
  const t = await getTranslations("pricing");

  return (
    <div className="mt-14 overflow-hidden rounded-2xl border border-border">
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] border-b border-border bg-slate-50 px-6 py-3.5 text-[12.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            <span>{t("comparison.title")}</span>
            <span className="text-center">{t("tiers.essentiel.name")}</span>
            <span className="text-center text-primary">{t("tiers.pro.name")}</span>
            <span className="text-center">{t("tiers.premium.name")}</span>
          </div>

          <div className="text-[14.5px]">
            {ROW_INDEXES.map((row) => (
              <div
                key={row}
                className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center border-b border-slate-100 px-6 py-3.5 last:border-b-0"
              >
                <span className="text-foreground">
                  {t(`comparison.rows.${row}.label`)}
                </span>
                {TIER_COLS.map((col) => (
                  <span
                    key={col}
                    dir="ltr"
                    className="text-center text-slate-700"
                  >
                    {t(`comparison.rows.${row}.${col}`)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
