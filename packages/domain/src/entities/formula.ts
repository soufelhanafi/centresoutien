import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { SubjectId } from './subject';
import type { GroupKind } from './group';

/**
 * ULID id prefix for formulas: `fml_01HW…`.
 *
 * Relocated here from `student-subscription.ts` (SOU-60, KICKOFF): the id and
 * prefix were stubbed there first because `StudentSubscription` needed a
 * `FormulaId` to exist before the `Formula` entity itself did ("SOU-63 must not
 * create [Formula]"). Now that this entity is real, it owns its id.
 */
export const FORMULA_ID_PREFIX = 'fml';

export type FormulaId = Brand<string, 'FormulaId'>;

/**
 * One subject's slice of a Formula's monthly price, in integer MAD centimes
 * (SOU-298). The ordered list of these on a Formula is its **per-subject price
 * map**: it declares how much of the bundle price each subject is worth, which
 * weighted teacher-fee attribution splits by instead of the old equal `price ÷ n`
 * share. The map's amounts must sum to the Formula's `priceMad` and cover exactly
 * the Formula's `subjectIds` — enforced by `assertValidFormulaSubjectPrices`
 * (`policies/formula-subject-prices.ts`, `InvalidFormulaSubjectPricesError`), never
 * at rest, so a hand-built entity can't smuggle a divergent split past the domain.
 */
export type FormulaSubjectPrice = {
  readonly subjectId: SubjectId;
  readonly priceMad: number; // integer MAD centimes, > 0
};

/**
 * A priced bundle of subjects a student subscribes to monthly (CLAUDE.md §7) — the
 * Formula is what a student pays for; the {@link Group} (elsewhere) is where they
 * learn. `StudentSubscription` freezes a snapshot of `kind` + `subjectIds` at
 * creation, so coverage questions never dereference this entity; `InvoiceLine`
 * likewise freezes `label` + `kind` + the billed amount at issue time. Both freezes
 * exist *because* a Formula can still change — until it can't (see below).
 *
 * `priceMad` is a single bundle price in integer MAD centimes, matching the
 * `InvoiceLine.amountMad` convention. `subjectPrices` (SOU-298) optionally breaks
 * that bundle price down per subject — an ordered {@link FormulaSubjectPrice} map
 * whose amounts sum to `priceMad` and cover exactly `subjectIds`. It exists purely
 * for **weighted teacher-fee attribution**: it never reaches the billed
 * `StudentSubscription`/`InvoiceLine` snapshots, which still carry only the single
 * bundle amount (SOU-60's frozen-snapshot invariant is untouched). A Formula with
 * no map (legacy rows, or a center that hasn't priced its subjects) attributes by
 * the original equal `price ÷ n` split — the map is a refinement, never a
 * requirement. `kind` reuses {@link GroupKind} — the same regular/exam-prep track
 * the group/coverage layer speaks, never a redefinition.
 *
 * **Immutable once referenced.** `isImmutable` starts `false` and is flipped to
 * `true` by a SQLite trigger the first time any `InvoiceLine` references this
 * formula (SOU-61) — the domain never sets it directly, hence `readonly`. Once
 * `true`, {@link updateFormula} (`policies/formula-policy.ts`) rejects **every**
 * field patch with `FormulaImmutableError`, not just `priceMad`/`subjectIds`: a
 * formula that has been billed is frozen history. The correct move for a price,
 * subject, or kind change on a used formula is to create a *new* Formula and
 * deactivate the old one (CLAUDE.md §7) — a distinct, non-generic operation that
 * does not go through the immutability-guarded patch path.
 *
 * `active` mirrors `Subject.active`: `false` hides the formula from new-subscription
 * pickers while keeping it queryable for historical reports (e.g. the old formula in
 * a create-new-deactivate-old price change). Not people-like, so it carries no
 * `naturalKey`. Soft-delete only: a tombstoned row still syncs.
 */
export type Formula = EntityEnvelope & {
  readonly id: FormulaId;
  name: { fr: string; ar: string };
  subjectIds: readonly SubjectId[];
  priceMad: number; // integer MAD centimes, matches InvoiceLine.amountMad
  subjectPrices?: readonly FormulaSubjectPrice[]; // per-subject split for weighted attribution; absent/empty = equal split (SOU-298)
  kind: GroupKind;
  readonly isImmutable: boolean; // flipped by a SQLite trigger (SOU-61), never by the domain
  active: boolean;
};
