import { getTranslations } from "next-intl/server";
import { FounderForm } from "./founder-form";
import { FOUNDER_PROGRAM_PLACES } from "@/lib/founder-program";

const STATS = ["places", "duration", "one_on_one"] as const;

export async function FounderProgram() {
  const t = await getTranslations("founder");
  const count = FOUNDER_PROGRAM_PLACES;

  return (
    <section
      id="programme-fondateur"
      aria-labelledby="founder-heading"
      className="bg-gradient-to-b from-slate-900 to-teal-950 px-8 py-24 text-white"
    >
      <div className="mx-auto grid max-w-[1100px] items-start gap-16 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-1.5 text-[12.5px] font-semibold text-teal-300">
            {t("badge", { count })}
          </span>
          <h2
            id="founder-heading"
            className="mt-5 text-4xl font-extrabold tracking-tight sm:text-[42px]"
          >
            {t("heading")}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            {t("body", { count })}
          </p>
          <p className="mt-4 text-[15px] text-slate-400">{t("note")}</p>
          <dl className="mt-7 grid grid-cols-3 gap-4">
            {STATS.map((k) => (
              <div key={k}>
                <dt className="text-[26px] font-extrabold text-teal-300">
                  <span dir="ltr">{t(`stats.${k}.value`, { count })}</span>
                </dt>
                <dd className="text-[12.5px] text-slate-400">
                  {t(`stats.${k}.label`)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <FounderForm />
      </div>
    </section>
  );
}
