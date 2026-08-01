import { describe, it, expect, beforeEach } from 'vitest';
import { ListStudentSubscriptions } from '../../../src/use-cases/list-student-subscriptions';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type {
  StudentSubscription,
  StudentSubscriptionId,
} from '../../../src/entities/student-subscription';
import type { FormulaId } from '../../../src/entities/formula';
import type { StudentId } from '../../../src/entities/student';
import type { SubjectId } from '../../../src/entities/subject';
import { InMemoryStudentSubscriptionRepository } from '../fakes/in-memory-student-subscription-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT_ID = 'stu_00000000000000000000000001' as StudentId;

const clock = fakeClock('2026-01-01T00:00:00Z');
let seq = 0;

function sub(startMonth: string, centerCode: CenterCode = CENTER): StudentSubscription {
  seq += 1;
  return {
    id: `sbs_${String(seq).padStart(26, '0')}` as StudentSubscriptionId,
    ...newEnvelope({ centerCode, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    studentId: STUDENT_ID,
    formulaId: 'fml_00000000000000000000000002' as FormulaId,
    kind: 'regular',
    subjectIds: ['sub_00000000000000000000000003' as SubjectId],
    startMonth,
    endMonth: null,
  };
}

describe('ListStudentSubscriptions', () => {
  let subscriptions: InMemoryStudentSubscriptionRepository;

  function build(plan: Plan): ListStudentSubscriptions {
    return new ListStudentSubscriptions(subscriptions, new PlanPolicy(plan));
  }

  beforeEach(() => {
    subscriptions = new InMemoryStudentSubscriptionRepository();
  });

  it('returns the student live subscriptions newest start first', async () => {
    await subscriptions.save(sub('2026-09'));
    await subscriptions.save(sub('2027-01'));
    const rows = await build(PLANS.essentiel).execute({ centerCode: CENTER, studentId: STUDENT_ID });
    expect(rows.map((r) => r.startMonth)).toEqual(['2027-01', '2026-09']);
  });

  it('excludes tombstoned subscriptions', async () => {
    const gone = sub('2026-09');
    await subscriptions.save(gone);
    await subscriptions.softDelete(gone.id, new Date('2026-10-01T00:00:00Z'), USER);
    const rows = await build(PLANS.essentiel).execute({ centerCode: CENTER, studentId: STUDENT_ID });
    expect(rows).toHaveLength(0);
  });

  it('never returns a foreign-center row (defensive scope filter)', async () => {
    await subscriptions.save(sub('2026-09', OTHER_CENTER));
    const rows = await build(PLANS.essentiel).execute({ centerCode: CENTER, studentId: STUDENT_ID });
    expect(rows).toHaveLength(0);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    await expect(
      build(planWithout).execute({ centerCode: CENTER, studentId: STUDENT_ID }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
