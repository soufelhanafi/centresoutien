import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One pricing tier card. The middle "Pro" tier is `highlighted`: dark slate
// background, white text, a "RECOMMANDÉ" pill, and a slight scale-up. All other
// styling flows from that single flag so the three cards stay interchangeable.

type PricingCardProps = {
  /** Message key under `pricing.tiers`, e.g. "essentiel". */
  tierId: "essentiel" | "pro" | "premium";
  /** How many `features.N` entries this tier lists. */
  featureCount: number;
  /** Renders the emphasised dark variant with the recommended badge. */
  highlighted?: boolean;
};

export async function PricingCard({
  tierId,
  featureCount,
  highlighted = false,
}: PricingCardProps) {
  const t = await getTranslations("pricing");
  const features = Array.from({ length: featureCount }, (_, i) => i);

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl p-8",
        highlighted
          ? "bg-slate-900 text-white shadow-[0_30px_60px_-30px_rgba(15,118,110,0.5)] lg:scale-[1.03]"
          : "border border-border bg-white",
      )}
    >
      {highlighted && (
        <span className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-primary px-3.5 py-1 text-xs font-bold tracking-[0.04em] text-primary-foreground">
          {t("badge_recommended")}
        </span>
      )}

      <h3
        className={cn(
          "text-[13px] font-bold uppercase tracking-[0.06em]",
          highlighted ? "text-teal-300" : "text-muted-foreground",
        )}
      >
        {t(`tiers.${tierId}.name`)}
      </h3>
      <p
        className={cn(
          "mt-1 text-[13.5px]",
          highlighted ? "text-slate-400" : "text-muted-foreground",
        )}
      >
        {t(`tiers.${tierId}.description`)}
      </p>

      <div className="mt-5 flex items-baseline gap-2">
        <span
          dir="ltr"
          className="text-[clamp(2.5rem,4vw,2.875rem)] font-extrabold tracking-tight"
        >
          {t(`tiers.${tierId}.price`)}
        </span>
        <span
          className={cn(
            "text-sm font-semibold",
            highlighted ? "text-slate-400" : "text-muted-foreground",
          )}
        >
          {t("per_year")}
        </span>
      </div>
      <p className={cn("text-[12.5px]", highlighted ? "text-slate-500" : "text-slate-400")}>
        <span dir="ltr">{t(`tiers.${tierId}.monthly`)}</span>
      </p>

      <Button
        variant={highlighted ? "secondary" : "outline"}
        className={cn(
          "mt-5 w-full",
          highlighted && "bg-white text-slate-900 hover:bg-slate-100",
        )}
      >
        {t(`tiers.${tierId}.cta`)}
      </Button>

      <ul
        className={cn(
          "mt-5 flex flex-col gap-2.5 text-[14.5px]",
          highlighted ? "text-border" : "text-slate-700",
        )}
      >
        {features.map((i) => (
          <li key={i} className="flex gap-2.5">
            <Check
              aria-hidden="true"
              className={cn(
                "mt-0.5 size-4 shrink-0",
                highlighted ? "text-teal-300" : "text-primary",
              )}
            />
            <span>{t(`tiers.${tierId}.features.${i}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
