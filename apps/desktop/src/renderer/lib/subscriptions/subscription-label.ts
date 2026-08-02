import type { FormulaView } from '../formulas/formula-view';
import { localizedFormulaName } from '../formulas/localized-name';
import type { SubjectView } from '../subjects/subject-view';
import { localizedSubjectName } from '../subjects/localized-name';
import type { SubscriptionView } from './subscription-view';

export type SubscriptionLabel = {
  /** The formula's bilingual name, or (formula no longer in the active picker set) the
   * frozen subject-id snapshot resolved to subject names — never a bare id. */
  readonly text: string;
  /** `null` when the formula could not be resolved (deactivated/historical): no
   * price is stored on the subscription itself, so none can be shown. */
  readonly priceMad: number | null;
};

/**
 * Resolves a subscription's display label. `formula.list` only returns active
 * formulas (KICKOFF SOU-65: a deactivated formula must never be offered for a
 * new subscription, and there is no `formula.get`), so a subscription pinned to
 * a since-deactivated formula falls back to its own frozen `subjectIds`
 * snapshot resolved against `subject.list` — degrading gracefully rather than
 * showing a bare id, matching the `weeklySessionViewSchema` fallback pattern.
 */
export function resolveSubscriptionLabel(
  subscription: Pick<SubscriptionView, 'formulaId' | 'subjectIds'>,
  formulas: readonly FormulaView[],
  subjects: readonly SubjectView[],
  locale: string,
): SubscriptionLabel {
  const formula = formulas.find((candidate) => candidate.id === subscription.formulaId);
  if (formula) {
    return { text: localizedFormulaName(formula.name, locale), priceMad: formula.priceMad };
  }

  const subjectNames = subscription.subjectIds.map((id) => {
    const subject = subjects.find((candidate) => candidate.id === id);
    return subject ? localizedSubjectName(subject.name, locale) : id;
  });
  return { text: subjectNames.join(' + '), priceMad: null };
}
