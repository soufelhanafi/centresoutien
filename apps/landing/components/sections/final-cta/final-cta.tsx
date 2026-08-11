import { getTranslations } from "next-intl/server";
import { ArrowRight, Download } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";

export async function FinalCta() {
  const t = await getTranslations("final_cta");

  return (
    <section
      id="contact"
      aria-labelledby="final-cta-heading"
      className="bg-primary px-8 py-24 text-center text-white"
    >
      <div className="mx-auto max-w-[900px]">
        <h2
          id="final-cta-heading"
          className="text-[clamp(2rem,4.5vw,2.875rem)] font-extrabold leading-[1.1] tracking-tight"
        >
          {t("heading")}
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-lg text-teal-100">
          {t("subheading")}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="#programme-fondateur"
            className={buttonVariants({
              size: "lg",
              className: "bg-white text-primary hover:bg-teal-50",
            })}
          >
            <Download aria-hidden="true" />
            {t("cta.download")}
          </Link>
          <Link
            href="#programme-fondateur"
            className={buttonVariants({
              size: "lg",
              variant: "outline",
              className: "border-white/40 bg-transparent text-white hover:bg-white/10",
            })}
          >
            {t("cta.demo")}
            <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </section>
  );
}
