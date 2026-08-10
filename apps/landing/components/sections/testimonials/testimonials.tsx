import { getTranslations } from "next-intl/server";
import { TestimonialCard } from "./testimonial-card";

const CARDS = [
  { key: "karim", initials: "KA", gradient: "from-primary to-teal-500" },
  { key: "nadia", initials: "NB", gradient: "from-violet-600 to-violet-400" },
  { key: "hicham", initials: "HT", gradient: "from-amber-600 to-amber-500" },
] as const;

export async function Testimonials() {
  const t = await getTranslations("testimonials");

  return (
    <section
      id="temoignages"
      aria-labelledby="temoignages-title"
      className="mx-auto max-w-[1200px] px-8 py-24"
    >
      <div className="mx-auto mb-14 max-w-[720px] text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
          {t("eyebrow")}
        </p>
        <h2
          id="temoignages-title"
          className="mt-2.5 text-[clamp(2rem,4vw,2.5rem)] font-extrabold leading-[1.12] tracking-tight text-foreground"
        >
          {t("heading")}
        </h2>
      </div>

      <div className="grid gap-[22px] md:grid-cols-3">
        {CARDS.map((card) => (
          <TestimonialCard
            key={card.key}
            initials={card.initials}
            gradient={card.gradient}
            ratingLabel={t("rating_label")}
            quote={t(`cards.${card.key}.quote`)}
            name={t(`cards.${card.key}.name`)}
            role={t(`cards.${card.key}.role`)}
          />
        ))}
      </div>
    </section>
  );
}
