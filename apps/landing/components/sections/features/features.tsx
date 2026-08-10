import { getTranslations } from "next-intl/server";
import { FeatureRow } from "./feature-row";
import {
  BilingualMockup,
  BillingMockup,
  PlanningMockup,
  RoomsMockup,
  StudentsMockup,
  TeachersMockup,
} from "./mockups";

// The Features section: a centered header block followed by six alternating
// feature rows. Fully static Server Component — every string comes from
// next-intl. The id must stay `fonctionnalites` (the header nav links to it).

const FEATURES = [
  { key: "rooms", visualFirst: true, Visual: RoomsMockup },
  { key: "planning", visualFirst: false, Visual: PlanningMockup },
  { key: "teachers", visualFirst: true, Visual: TeachersMockup },
  { key: "students", visualFirst: false, Visual: StudentsMockup },
  { key: "billing", visualFirst: true, Visual: BillingMockup },
  { key: "bilingual", visualFirst: false, Visual: BilingualMockup },
] as const;

export async function Features() {
  const t = await getTranslations("features");

  return (
    <section
      id="fonctionnalites"
      aria-labelledby="fonctionnalites-title"
      className="mx-auto max-w-[1200px] px-8 py-24"
    >
      <div className="mx-auto mb-16 max-w-3xl text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
          {t("eyebrow")}
        </p>
        <h2
          id="fonctionnalites-title"
          className="mt-2.5 text-[clamp(2rem,4vw,2.625rem)] font-extrabold leading-[1.12] tracking-tight text-foreground"
        >
          {t("heading")}
        </h2>
        <p className="mt-3.5 text-lg text-slate-600">{t("subheading")}</p>
      </div>

      <div className="flex flex-col gap-24">
        {FEATURES.map(({ key, visualFirst, Visual }) => (
          <FeatureRow
            key={key}
            featureKey={key}
            visualFirst={visualFirst}
            visual={<Visual />}
          />
        ))}
      </div>
    </section>
  );
}
