import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

// One alternating feature row: a text block (eyebrow + h3 + 3 checked points)
// and a decorative product mockup. `visualFirst` controls DOM order, which the
// two-column grid follows directly — so the visual lands on the start side for
// odd rows and the end side for even rows, on both mobile and desktop, without
// any directional order hacks.

type FeatureRowProps = {
  /** Message key under `features.items`, e.g. "rooms". */
  featureKey: string;
  /** When true the mockup comes first (start side); otherwise the text does. */
  visualFirst: boolean;
  /** The pre-built mockup element for this feature. */
  visual: ReactNode;
};

const POINT_INDEXES = [0, 1, 2] as const;

export async function FeatureRow({
  featureKey,
  visualFirst,
  visual,
}: FeatureRowProps) {
  const t = await getTranslations(`features.items.${featureKey}`);

  const text = (
    <div>
      <p className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-primary">
        {t("eyebrow")}
      </p>
      <h3 className="mt-2.5 text-[clamp(1.5rem,3vw,1.875rem)] font-extrabold leading-[1.15] tracking-tight text-foreground">
        {t("heading")}
      </h3>
      <ul className="mt-3.5 flex flex-col gap-2.5 text-[15.5px] text-slate-700">
        {POINT_INDEXES.map((index) => (
          <li key={index} className="flex gap-2.5">
            <Check
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            <span>{t(`points.${index}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      {visualFirst ? (
        <>
          {visual}
          {text}
        </>
      ) : (
        <>
          {text}
          {visual}
        </>
      )}
    </div>
  );
}
