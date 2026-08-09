import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@centresoutien/domain';
import { useUpgradePromptStore } from '../stores/upgrade-prompt-store';
import { minimumPlanFor } from '../lib/plan/minimum-plan';

type UpgradeCta = {
  /** Plan-aware label, e.g. "Débloquer avec Pro" / "افتح مع بريميوم". */
  ctaLabel: string;
  /** Omitted when `feature` is undefined so `LockOverlay` hides the button. */
  onCta: (() => void) | undefined;
};

/**
 * The props a gated `LockOverlay` (or inline gate) spreads to show its upgrade
 * CTA: a plan-named label plus a handler that opens the shared upgrade dialog.
 *
 * `feature` may be `undefined` for an ungated module (see `ModulePlaceholder`) —
 * hooks can't be conditional, so callers always call this; an undefined flag
 * yields no handler and the button never renders.
 */
export function useUpgradeCta(feature: FeatureFlag | undefined): UpgradeCta {
  const { t } = useTranslation();
  const open = useUpgradePromptStore((state) => state.open);

  if (feature === undefined) {
    return { ctaLabel: '', onCta: undefined };
  }

  const planName = t(`plan.names.${minimumPlanFor(feature)}`);
  return {
    ctaLabel: t('upgrade.unlockWith', { plan: planName }),
    onCta: () => open(feature),
  };
}
