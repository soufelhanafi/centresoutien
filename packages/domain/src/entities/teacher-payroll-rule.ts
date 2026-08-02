import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { TeacherId } from './teacher';

/** ULID id prefix for teacher payroll rules: `pyr_01HW…`. */
export const TEACHER_PAYROLL_RULE_ID_PREFIX = 'pyr';

export type TeacherPayrollRuleId = Brand<string, 'TeacherPayrollRuleId'>;

/**
 * The two payroll rule kinds Centre Soutien pays teachers under (CLAUDE.md §6).
 * All pay is monthly — never per session — so a rule never names a session count.
 */
export const TEACHER_PAYROLL_RULE_KINDS = ['fixed-monthly', 'percentage-of-monthly-fees'] as const;
export type TeacherPayrollRuleKind = (typeof TEACHER_PAYROLL_RULE_KINDS)[number];

type TeacherPayrollRuleEnvelope = EntityEnvelope & {
  readonly id: TeacherPayrollRuleId;
  teacherId: TeacherId;
  /** Inclusive `YYYY-MM`, the first month this rule pays. */
  startMonth: string;
  /** Inclusive `YYYY-MM`, or `null` while the rule is open-ended (live). */
  endMonth: string | null;
};

/**
 * How a teacher is paid monthly — a tagged union closed to exactly two kinds
 * (CLAUDE.md §6): a flat amount, or a percentage of the fees attributable to the
 * teacher (the `TeacherFeeAttributionPolicy` that computes that attribution is a
 * future ticket; this rule only stores the `percent` it applies). A third kind
 * cannot be constructed: the union has no member for it, and an exhaustive
 * `switch` over `kind` fails to compile if one is ever added without updating
 * every consumer (see `teacher-payroll-rule.test.ts`).
 *
 * **Derived status, never stored** — same rule as {@link
 * import('./student-subscription').StudentSubscription}: a rule is "active for
 * month M" iff `startMonth <= M AND (endMonth === null OR M <= endMonth)`. There
 * is no `status` field.
 *
 * **At-most-one-active-per-teacher**, not split by kind (unlike subscriptions,
 * which split by `regular`/`exam-prep`): a teacher holds at most one live rule —
 * fixed or percentage — at a time. `CreateTeacherPayrollRule` rejects a new rule
 * whose `[startMonth, endMonth|∞]` overlaps an existing live rule for the same
 * teacher (`TooManyActivePayrollRulesError`). The guard lives in the domain, not
 * a DB constraint, so two concurrent creates converge on sync.
 *
 * **Close-and-reopen** — never edited in place to change kind or amount.
 * `CloseTeacherPayrollRule` sets `endMonth`; a rule change is a close of the
 * current one plus a fresh `CreateTeacherPayrollRule` for the next month.
 *
 * Not people-like, so it carries no `naturalKey` — identified by its
 * relationships (teacher + month range), not a matching key. Soft-delete only.
 */
export type TeacherPayrollRule =
  | (TeacherPayrollRuleEnvelope & { kind: 'fixed-monthly'; amountMad: number })
  | (TeacherPayrollRuleEnvelope & { kind: 'percentage-of-monthly-fees'; percent: number });
