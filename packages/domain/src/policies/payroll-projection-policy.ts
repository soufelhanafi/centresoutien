import type { TeacherId } from '../entities/teacher';
import type { SubjectId } from '../entities/subject';
import type { TeacherPayrollRule } from '../entities/teacher-payroll-rule';

export type TeacherPayrollProjection = {
  readonly teacherId: TeacherId;
  readonly ruleKind: TeacherPayrollRule['kind'];
  // Collected-to-date payout; equals projeteMad for fixed-monthly (no collection variance).
  readonly encaisseMad: number;
  // Projected month-end payout over the expected roster.
  readonly projeteMad: number;
  // Percent snapshotted for percentage-of-monthly-fees; null for fixed-monthly.
  readonly percentSnapshot: number | null;
};

export type TeacherProjectedAttribution = {
  readonly teacherId: TeacherId;
  readonly subjectId: SubjectId;
  readonly amountMad: number;
};

export type ProjectedPayoutAmounts = Omit<TeacherPayrollProjection, 'teacherId'>;

// Pure payout projection math (SOU-316): fixed-monthly returns the flat amount
// for both figures; percentage applies each base's own percent and rounds to
// whole centimes.
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

// Collapses teacher→subject→amount to a per-teacher total (the projected
// ledger's equivalent of TeacherFeeAttributionPolicy.attribute).
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
