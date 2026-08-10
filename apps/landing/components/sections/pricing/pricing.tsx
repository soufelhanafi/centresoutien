import { getTranslations } from "next-intl/server";
import { PricingCard } from "./pricing-card";
import { ComparisonTable } from "./comparison-table";

// Pricing section: centered header, three tier cards (Pro highlighted), a
// detailed comparison table, and a footnote. Content comes entirely from the
// `pricing` next-intl namespace; feature counts per tier are fixed by the design.

const TIERS = [
  { id: "essentiel", featureCount: 5, highlighted: false },
  { id: "pro", featureCount: 6, highlighted: true },
  { id: "premium", featureCount: 5, highlighted: false },
] as const;

export async function Pricing() {
  const t = await getTranslations("pricing");

  return (
    <section
      id="tarifs"
      aria-labelledby="pricing-heading"
      className="mx-auto max-w-[1200px] px-8 py-24"
    >
      <div className="mx-auto mb-14 max-w-[720px] text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
          {t("eyebrow")}
        </p>
        <h2
          id="pricing-heading"
          className="mt-2.5 text-[clamp(2rem,4vw,2.625rem)] font-extrabold leading-[1.12] tracking-tight text-foreground"
        >
          {t("heading")}
        </h2>
        <p className="mt-3.5 text-lg text-slate-600">{t("subheading")}</p>
      </div>

      <div className="grid items-stretch gap-5 md:grid-cols-3">
        {TIERS.map((tier) => (
          <PricingCard
            key={tier.id}
            tierId={tier.id}
            featureCount={tier.featureCount}
            highlighted={tier.highlighted}
          />
        ))}
      </div>

      <ComparisonTable />

      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        {t("footnote")}
      </p>
    </section>
  );
}
