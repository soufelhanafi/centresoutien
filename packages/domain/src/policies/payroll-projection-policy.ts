import type { TeacherId } from '../entities/teacher';
import type { SubjectId } from '../entities/subject';
import type { TeacherPayrollRule } from '../entities/teacher-payroll-rule';

/** One teacher's in-progress payout figure for the (not-yet-closed) `month`. */
export type TeacherPayrollProjection = {
  readonly teacherId: TeacherId;
  readonly ruleKind: TeacherPayrollRule['kind'];
  /** Collected-to-date payout (MAD centimes). Equals `projeteMad` for `fixed-monthly`. */
  readonly encaisseMad: number;
  /** Projected month-end payout (MAD centimes) over the expected roster. */
  readonly projeteMad: number;
  /** The percent snapshotted for `percentage-of-monthly-fees`; `null` for `fixed-monthly`. */
  readonly percentSnapshot: number | null;
};

/** One subject's projected (expected) attribution for one teacher — the projection's basis drill-down. */
export type TeacherProjectedAttribution = {
  readonly teacherId: TeacherId;
  readonly subjectId: SubjectId;
  readonly amountMad: number;
};

/** The payout figures, keyed off the teacher id — the amount math separated from `GetPayrollProjection`'s orchestration. */
export type ProjectedPayoutAmounts = Omit<TeacherPayrollProjection, 'teacherId'>;

/**
 * The pure payout projection math (SOU-316), kept separate from the read
 * orchestration so it is unit-testable in isolation. For `fixed-monthly` the
 * collected and projected figures are the flat amount (no collection variance);
 * for `percentage-of-monthly-fees` each figure is the respective attribution
 * base × percent, rounded to whole centimes.
 */
export function projectPayoutAmounts(
  rule: TeacherPayrollRule,
  collectedBaseMad: number,
  projectedBaseMad: number,
): ProjectedPayoutAmounts {
  if (rule.kind === 'fixed-monthly') {
    return {
      ruleKind: 'fixed-monthly',
      encaisseMad: rule.amountMad,
      projeteMad: rule.amountMad,
      percentSnapshot: null,
    };
  }
  return {
    ruleKind: 'percentage-of-monthly-fees',
    encaisseMad: Math.round((collectedBaseMad * rule.percent) / 100),
    projeteMad: Math.round((projectedBaseMad * rule.percent) / 100),
    percentSnapshot: rule.percent,
  };
}

/**
 * Collapses a teacher→subject→amount map to a per-teacher total — the projected
 * ledger's equivalent of `TeacherFeeAttributionPolicy.attribute`'s collapsed sum,
 * derived from the already-computed subject breakdown rather than a second scan.
 */
export function sumAttributionByTeacher(
  byTeacherSubject: ReadonlyMap<TeacherId, ReadonlyMap<SubjectId, number>>,
): ReadonlyMap<TeacherId, number> {
  const totals = new Map<TeacherId, number>();
  for (const [teacherId, bySubject] of byTeacherSubject) {
    let total = 0;
    for (const amountMad of bySubject.values()) total += amountMad;
    totals.set(teacherId, total);
  }
  return totals;
}

/** Flattens a teacher→subject→amount map to the projection's basis rows. */
export function flattenAttributionByTeacher(
  byTeacherSubject: ReadonlyMap<TeacherId, ReadonlyMap<SubjectId, number>>,
): readonly TeacherProjectedAttribution[] {
  const rows: TeacherProjectedAttribution[] = [];
  for (const [teacherId, bySubject] of byTeacherSubject) {
    for (const [subjectId, amountMad] of bySubject) {
      rows.push({ teacherId, subjectId, amountMad });
    }
  }
  return rows;
}
