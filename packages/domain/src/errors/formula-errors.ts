import { DomainError } from './plan-errors';
import type { FormulaId } from '../entities/formula';

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
