import { getTranslations } from "next-intl/server";
import { FaqItem } from "./faq-item";

const ITEMS = [
  "offline",
  "storage",
  "updates",
  "multi_center",
  "support",
  "trial",
  "refund",
  "training",
] as const;

export async function Faq() {
  const t = await getTranslations("faq");

  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="border-t border-slate-100 bg-slate-50 px-8 py-24"
    >
      <div className="mx-auto max-w-[820px]">
        <div className="mb-12 text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
            {t("eyebrow")}
          </p>
          <h2
            id="faq-title"
            className="mb-3.5 mt-2.5 text-[clamp(2rem,4vw,2.5rem)] font-extrabold leading-[1.12] tracking-tight text-foreground"
          >
            {t("heading")}
          </h2>
        </div>

        <div className="flex flex-col gap-2.5">
          {ITEMS.map((key, index) => (
            <FaqItem
              key={key}
              question={t(`items.${key}.question`)}
              answer={t(`items.${key}.answer`)}
              defaultOpen={index === 0}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
