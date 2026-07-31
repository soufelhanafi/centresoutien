import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { StudentId } from './student';
import type { SubjectId } from './subject';
import type { GroupKind } from './group';

/**
 * ULID id prefix for student subscriptions: `sbs_01HW…`.
 *
 * NOTE — deliberately **not** `sub`: the {@link Subject} entity already owns the
 * `sub_` prefix. Two entity types sharing a prefix would defeat the id-prefix
 * CHECK/brand routing and eyeball-debuggability the sync design relies on, so a
 * student *subscription* takes its own `sbs_` prefix.
 */
export const STUDENT_SUBSCRIPTION_ID_PREFIX = 'sbs';

export type StudentSubscriptionId = Brand<string, 'StudentSubscriptionId'>;

/** ULID id prefix for formulas: `fml_01HW…`. */
export const FORMULA_ID_PREFIX = 'fml';

/**
 * An **opaque** reference to a Formula. The `Formula` entity does not exist in the
 * codebase yet (SOU-63 must not create one). A subscription only ever holds the id
 * as a provenance breadcrumb — every question the domain asks ("is this student
 * covered for subject X in month M, and on which track?") is answered from the
 * subscription's own frozen snapshot, never by dereferencing this id.
 */
export type FormulaId = Brand<string, 'FormulaId'>;

/**
 * A student's subscription to a Formula — the priced bundle they pay for monthly
 * (CLAUDE.md §7). Invoicing is per active subscription, never per group/session.
 *
 * **Frozen formula snapshot.** The subscription stores `formulaId` (an opaque ref)
 * PLUS a snapshot of the formula's `kind` and `subjectIds`, captured at creation.
 * Formulas are immutable-after-use and a price/subject change spawns a *new*
 * formula; freezing the snapshot here means coverage is answerable from the
 * subscription alone and old subscriptions keep their historical bundle forever —
 * no join to a mutable formula, deterministic under sync.
 *
 * **Derived status, never stored.** There is no `status` field. A subscription is
 * "active for month M" iff `startMonth <= M AND (endMonth === null OR M <= endMonth)`
 * (all months are `YYYY-MM`, lexicographically comparable). Closing sets `endMonth`;
 * an open-ended (live) subscription has `endMonth: null`. This mirrors the repo rule
 * that invoice status is derived from append-only payments, not an editable scalar —
 * a derived status has no same-field clash to reconcile on sync.
 *
 * **Close-and-reopen.** A subscription is never edited in place to change its
 * formula. `CloseStudentSubscription` sets `endMonth`; a formula change is a close
 * of the current one plus a fresh `CreateStudentSubscription` for the next month.
 *
 * **At-most-one-active per (student, kind).** The `CreateStudentSubscription` use
 * case rejects a new subscription of a `kind` whose `[startMonth, endMonth|∞]` range
 * overlaps an existing live subscription of the same kind for that student
 * (`TooManyActiveSubscriptionsError`). Two of the same kind that do not overlap —
 * properly closed, then reopened the next month — are allowed. The guard lives in
 * the domain (not a DB UNIQUE constraint) so two concurrent creates *converge* on
 * sync rather than failing a push.
 *
 * Not people-like, so it carries no `naturalKey` — a subscription is identified by
 * its relationships (student + formula + month range), not by a matching key.
 * Soft-delete only: a tombstoned row still syncs. `kind` reuses {@link GroupKind}
 * (`regular` | `exam-prep`), the same track type the group/coverage layer speaks.
 */
export type StudentSubscription = EntityEnvelope & {
  readonly id: StudentSubscriptionId;
  studentId: StudentId;
  formulaId: FormulaId;
  kind: GroupKind;
  subjectIds: readonly SubjectId[];
  startMonth: string; // 'YYYY-MM', inclusive
  endMonth: string | null; // 'YYYY-MM' inclusive, or null when open-ended (live)
};
