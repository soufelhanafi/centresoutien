import { getTranslations } from "next-intl/server";
import { StepCard } from "./step-card";

const STEPS = ["install", "setup", "daily"] as const;

export async function HowItWorks() {
  const t = await getTranslations("how_it_works");

  return (
    <section
      id="comment-ca-marche"
      aria-labelledby="comment-ca-marche-title"
      className="border-t border-slate-100 bg-slate-50 px-8 py-[88px]"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto mb-12 max-w-[720px] text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
            {t("eyebrow")}
          </p>
          <h2
            id="comment-ca-marche-title"
            className="mt-2.5 text-[clamp(2rem,4vw,2.5rem)] font-extrabold leading-[1.12] tracking-tight text-foreground"
          >
            {t("heading")}
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((step) => (
            <StepCard
              key={step}
              number={t(`steps.${step}.number`)}
              title={t(`steps.${step}.title`)}
              body={t.rich(`steps.${step}.body`, {
                strong: (chunks) => (
                  <strong className="text-foreground">{chunks}</strong>
                ),
              })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
