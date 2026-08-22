import { DomainError } from './plan-errors';
import type { FormulaId } from '../entities/formula';
import type { SubjectId } from '../entities/subject';

/**
 * Thrown when any field patch is attempted against a Formula whose `isImmutable`
 * flag is true — CLAUDE.md §7's "immutable pricing/subjects after use" invariant,
 * generalized to every field once an invoice line has referenced the formula
 * (KICKOFF, SOU-60): a billed formula is frozen history, full stop. The correct
 * move for a price, subject, or kind change is to create a *new* Formula and
 * deactivate the old one, never to mutate one that has already been billed. The
 * renderer resolves the stable `formula-immutable` code to a localized message
 * that steers the user to "dupliquer" (clone, SOU-62) instead of editing.
 */
export class FormulaImmutableError extends DomainError {
  readonly code = 'formula-immutable';

  constructor(readonly formulaId: FormulaId) {
    super(`Formula "${formulaId}" is immutable: it has been referenced by an invoice line.`);
  }
}

/**
 * Thrown when an update, get, or clone targets a formula id that has no live row
 * in the current center — unknown, soft-deleted, or belonging to another center.
 * The renderer resolves the stable `formula-not-found` code via
 * `t(\`errors.${code}\`)`; the domain stays i18n-agnostic. Mirrors
 * {@link SubjectNotFoundError} so the formula CRUD use cases behave consistently
 * and never silently no-op on a stale/foreign id.
 */
export class FormulaNotFoundError extends DomainError {
  readonly code = 'formula-not-found';

  constructor(readonly formulaId: FormulaId) {
    super(`No live formula with id "${formulaId}".`);
  }
}

/** Why a Formula's per-subject price map is rejected: its amounts don't sum to the
 *  bundle price, its subjects don't match the Formula's `subjectIds`, or an amount
 *  is not a positive integer. */
export type InvalidFormulaSubjectPricesReason = 'sum-mismatch' | 'coverage-mismatch' | 'invalid-amount';

/**
 * Thrown when a Formula's `subjectPrices` map (SOU-298) is present but violates the
 * construction invariant: the per-subject amounts must sum to the Formula's
 * `priceMad` (`sum-mismatch`), must cover exactly the Formula's `subjectIds` with
 * no missing/extra/duplicate subject (`coverage-mismatch`), and each amount must be
 * a positive integer number of MAD centimes (`invalid-amount`). Enforced by
 * `assertValidFormulaSubjectPrices` in `CreateFormula` / `UpdateFormula` /
 * `CloneFormula` so a divergent split can never reach the weighted-attribution
 * policy. The renderer resolves the stable `formula-subject-prices-sum-mismatch` /
 * `formula-subject-prices-coverage-mismatch` / `formula-subject-prices-invalid-amount`
 * code; the domain stays i18n-agnostic.
 */
export class InvalidFormulaSubjectPricesError extends DomainError {
  readonly code:
    | 'formula-subject-prices-sum-mismatch'
    | 'formula-subject-prices-coverage-mismatch'
    | 'formula-subject-prices-invalid-amount';

  constructor(readonly reason: InvalidFormulaSubjectPricesReason) {
    super(`Formula per-subject price map is invalid (${reason}).`);
    this.code =
      reason === 'sum-mismatch'
        ? 'formula-subject-prices-sum-mismatch'
        : reason === 'coverage-mismatch'
          ? 'formula-subject-prices-coverage-mismatch'
          : 'formula-subject-prices-invalid-amount';
  }
}

/** Why a subject cannot back a formula: it has no live row, or it is deactivated. */
export type FormulaSubjectUnavailableReason = 'not-found' | 'inactive';

/**
 * Thrown when one of a formula's `subjectIds` does not resolve to a live, active
 * Subject of the same center — it is unknown/tombstoned (`not-found`) or
 * deactivated (`inactive`). Checked by `CreateFormula`, `UpdateFormula`, and
 * `CloneFormula` via `validateFormulaSubjects` — a bundle's subjects are an
 * invariant of the Formula at rest, not just at creation (mirrors
 * {@link GroupSubjectUnavailableError}). The renderer resolves the stable
 * `formula-subject-not-found` / `formula-subject-inactive` code via
 * `t(\`errors.${code}\`)`; the domain stays i18n-agnostic.
 */
export class FormulaSubjectUnavailableError extends DomainError {
  readonly code: 'formula-subject-not-found' | 'formula-subject-inactive';

  constructor(
    readonly subjectId: SubjectId,
    readonly reason: FormulaSubjectUnavailableReason,
  ) {
    super(`Subject "${subjectId}" cannot back a formula (${reason}).`);
    this.code = reason === 'not-found' ? 'formula-subject-not-found' : 'formula-subject-inactive';
  }
}
