import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";

// Flat feature checklist: a centered header followed by a two-column grid of
// check-marked capabilities. Replaces the old tiered pricing section (SOU-308) —
// no plans, no prices, no comparison table. Content comes from the
// `features_checklist` next-intl namespace.

const FEATURE_INDEXES = Array.from({ length: 16 }, (_, i) => i);

export async function FeaturesChecklist() {
  const t = await getTranslations("features_checklist");

  return (
    <section
      aria-labelledby="features-checklist-heading"
      className="mx-auto max-w-[1200px] px-8 py-24"
    >
      <div className="mx-auto mb-12 max-w-[720px] text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
          {t("eyebrow")}
        </p>
        <h2
          id="features-checklist-heading"
          className="mt-2.5 text-[clamp(2rem,4vw,2.625rem)] font-extrabold leading-[1.12] tracking-tight text-foreground"
        >
          {t("heading")}
        </h2>
        <p className="mt-3.5 text-lg text-slate-600">{t("subheading")}</p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-8">
        <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {FEATURE_INDEXES.map((index) => (
            <li key={index} className="flex items-start gap-3">
              <Check
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span className="text-[15px] text-slate-700">
                {t(`items.${index}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
