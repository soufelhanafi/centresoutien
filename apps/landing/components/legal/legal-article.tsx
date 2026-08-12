import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JsonLd } from "@/components/seo/json-ld";
import { getBreadcrumbSchema } from "@/lib/structured-data";

type LegalArticleProps = {
  locale: Locale;
  namespace: string;
  path: string;
  sections: ReadonlyArray<string>;
};

// Shared shell for the static legal pages (mentions légales, CGV, loi 09-08).
// The locale-aware breadcrumb mirrors /confidentialite; each page only supplies
// its message namespace, route path, and section keys.
export async function LegalArticle({
  locale,
  namespace,
  path,
  sections,
}: LegalArticleProps) {
  const t = await getTranslations({ locale, namespace });

  return (
    <main className="mx-auto max-w-3xl px-8 py-24">
      <JsonLd
        id="ld-breadcrumb"
        data={getBreadcrumbSchema(locale, [
          { name: "Centre Soutien", path: "" },
          { name: t("breadcrumb"), path },
        ])}
      />
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
        {t("heading")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("updated")}</p>
      <p className="mt-6 text-lg leading-relaxed text-slate-600">{t("intro")}</p>
      <div className="mt-10 flex flex-col gap-8">
        {sections.map((key) => (
          <section key={key}>
            <h2 className="text-xl font-bold text-foreground">
              {t(`sections.${key}.title`)}
            </h2>
            <p className="mt-2 leading-relaxed text-slate-600">
              {t(`sections.${key}.body`)}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
