import { getTranslations } from "next-intl/server";
import { AlertTriangle, CreditCard, Home } from "lucide-react";
import { ProblemCard } from "./problem-card";

const CARDS = [
  { key: "excel", icon: AlertTriangle, tile: "bg-red-50 text-red-500" },
  { key: "invoices", icon: CreditCard, tile: "bg-amber-50 text-amber-600" },
  { key: "rooms", icon: Home, tile: "bg-blue-50 text-blue-600" },
] as const;

export async function Problem() {
  const t = await getTranslations("problem");

  return (
    <section
      id="probleme"
      aria-labelledby="probleme-title"
      className="border-y border-slate-100 bg-slate-50 px-8 py-[88px]"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="max-w-[720px]">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
            {t("eyebrow")}
          </p>
          <h2
            id="probleme-title"
            className="mb-3.5 mt-2.5 text-[clamp(2rem,4vw,2.5rem)] font-extrabold leading-[1.15] tracking-tight text-foreground"
          >
            {t("heading")}
          </h2>
          <p className="text-[17px] text-slate-600">{t("subheading")}</p>
        </div>

        <div className="mt-11 grid gap-5 md:grid-cols-3">
          {CARDS.map((card) => (
            <ProblemCard
              key={card.key}
              icon={card.icon}
              tile={card.tile}
              title={t(`cards.${card.key}.title`)}
              body={t(`cards.${card.key}.body`)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
