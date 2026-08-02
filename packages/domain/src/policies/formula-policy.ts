import { applyWrite } from '../entities/write';
import type { WriteContext, WriteResult } from '../entities/write';
import { FormulaImmutableError } from '../errors/formula-errors';
import type { Formula } from '../entities/formula';

/**
 * The domain fields a caller may ever patch on a Formula — `id` and the envelope
 * identity fields are never patched (mirrors {@link applyWrite}'s `Partial<T>`,
 * narrowed here since a Formula's `id` is `readonly` and `isImmutable` is a
 * data-layer field the domain never assigns directly, see {@link Formula}).
 */
export type FormulaPatch = Partial<Pick<Formula, 'name' | 'subjectIds' | 'priceMad' | 'kind' | 'active'>>;

/**
 * Applies `patch` to `prev`, enforcing the immutable-once-referenced barrier
 * (CLAUDE.md §7, KICKOFF SOU-60): once `prev.isImmutable` is true — an invoice line
 * has referenced this formula — **every** field patch is rejected with
 * `FormulaImmutableError`, including a no-op or an `active`-only toggle. A used
 * formula is frozen history; the only correct move is a *new* Formula plus
 * deactivating the old one, which is its own operation and deliberately does not
 * go through this guarded patch path (future ticket — out of scope here).
 *
 * When the formula is still mutable, delegates straight to {@link applyWrite} for
 * the standard bump-`updatedAt`/report-changed-fields behavior.
 */
export function updateFormula(
  prev: Formula,
  patch: FormulaPatch,
  ctx: WriteContext,
): WriteResult<Formula> {
  if (prev.isImmutable) {
    throw new FormulaImmutableError(prev.id);
  }
  return applyWrite<Formula>(prev, patch, ctx);
}

/**
 * Sets `active: false`, deliberately bypassing the `isImmutable` barrier
 * {@link updateFormula} enforces (SOU-62 KICKOFF: the SOU-60 review flagged that
 * `updateFormula` rejects *every* patch on a used formula, including a bare
 * `active` toggle — leaving CLAUDE.md §7's "create a new Formula and deactivate
 * the old one" workflow with no way to actually deactivate the old one once it has
 * been billed). `active` is otherwise not part of `FormulaInput`/`formulaInputSchema`
 * at all, so this is the only path that ever writes it — one-directional by
 * design, no reactivate: the CRUD UI's "deactivate" action wires here instead of
 * the generic update path, on both mutable and immutable formulas alike.
 */
export function deactivateFormula(prev: Formula, ctx: WriteContext): WriteResult<Formula> {
  return applyWrite<Formula>(prev, { active: false }, ctx);
}
