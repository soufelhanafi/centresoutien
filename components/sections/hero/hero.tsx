import { getTranslations } from "next-intl/server";
import { Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardMockup } from "./dashboard-mockup";

const TRUST_ITEMS = ["no_card", "quick_install", "local_data"] as const;

export async function Hero() {
  const t = await getTranslations("hero");

  return (
    <section
      id="accueil"
      className="mx-auto grid max-w-[1200px] items-center gap-14 px-8 pb-24 pt-16 lg:grid-cols-[1fr_1.1fr]"
    >
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-[13px] font-semibold text-primary">
          {t("badge")}
        </span>

        <h1 className="mt-5 text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold leading-[1.06] tracking-tight text-foreground">
          {t.rich("headline", {
            highlight: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
        </h1>

        <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
          {t("subheadline")}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" className="shadow-lg shadow-primary/25">
            {t("cta.primary")}
          </Button>
          <Button variant="outline" size="lg">
            <Play aria-hidden="true" className="fill-primary text-primary" />
            {t("cta.secondary")}
          </Button>
        </div>

        <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-[13.5px] text-muted-foreground">
          {TRUST_ITEMS.map((item) => (
            <li key={item} className="inline-flex items-center gap-2">
              <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
              {t(`trust.${item}`)}
            </li>
          ))}
        </ul>
      </div>

      <DashboardMockup />
    </section>
  );
}
