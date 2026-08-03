import { describe, it, expect, beforeEach } from 'vitest';
import { ListOverdueInvoices } from '../../../src/use-cases/list-overdue-invoices';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import { normalizePhone } from '../../../src/value-objects/phone-number';
import type { Parent, ParentId } from '../../../src/entities/parent';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { StudentId } from '../../../src/entities/student';
import type { GroupId } from '../../../src/entities/group';
import type { OverdueInvoiceLineView } from '../../../src/read-models/overdue-invoice-view';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryOverdueInvoiceViewReadPort } from '../fakes/in-memory-overdue-invoice-view-read-port';
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const TODAY_ISO = '2026-08-15T09:00:00Z'; // 'today' the clock reports
const GROUP_A = 'grp_00000000000000000000000001' as GroupId;
const GROUP_B = 'grp_00000000000000000000000002' as GroupId;

let invoiceSeq = 0;
let studentSeq = 0;
function makeRow(over: Partial<OverdueInvoiceLineView> = {}): OverdueInvoiceLineView {
  invoiceSeq += 1;
  studentSeq += 1;
  return {
    invoiceId: `inv_${String(invoiceSeq).padStart(26, '0')}` as InvoiceId,
    month: '2026-05',
    studentId: `stu_${String(studentSeq).padStart(26, '0')}` as StudentId,
    studentName: { fr: `Élève ${studentSeq}`, ar: `تلميذ ${studentSeq}` },
    guardianIds: [],
    groupIds: [],
    totalMad: 35000,
    netPaidMad: 0,
    ...over,
  };
}

let parentSeq = 0;
function makeParent(name: string, over: Partial<Parent> = {}): Parent {
  parentSeq += 1;
  return {
    id: `prt_${String(parentSeq).padStart(26, '0')}` as ParentId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock(TODAY_ISO)),
    naturalKey: `${CENTER}::${name}`,
    name,
    phone: normalizePhone('0612345678'),
    email: null,
    relation: 'pere',
    whatsappOptIn: false,
    ...over,
  };
}

describe('ListOverdueInvoices', () => {
  let readPort: InMemoryOverdueInvoiceViewReadPort;
  let parents: InMemoryParentRepository;

  function build(plan: Plan = PLANS.essentiel): ListOverdueInvoices {
    return new ListOverdueInvoices(readPort, parents, fakeClock(TODAY_ISO), new PlanPolicy(plan));
  }

  beforeEach(() => {
    readPort = new InMemoryOverdueInvoiceViewReadPort();
    parents = new InMemoryParentRepository();
    invoiceSeq = 0;
    studentSeq = 0;
    parentSeq = 0;
  });

  describe('happy path', () => {
    it('lists an overdue unpaid invoice grouped under its linked parent', async () => {
      const parent = makeParent('Ahmed Benali');
      await parents.save(parent);
      readPort.seed(
        CENTER,
        makeRow({ month: '2026-05', totalMad: 35000, netPaidMad: 0, guardianIds: [parent.id] }),
      );

      const result = await build().execute({ centerCode: CENTER });

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]?.parentId).toBe(parent.id);
      expect(result.groups[0]?.parentName).toBe('Ahmed Benali');
      expect(result.groups[0]?.totalOutstandingMad).toBe(35000);
      expect(result.groups[0]?.invoices).toHaveLength(1);
      expect(result.groups[0]?.invoices[0]?.status).toBe('unpaid');
      expect(result.groups[0]?.invoices[0]?.monthsOverdue).toBe(3); // May -> August
    });

    it('excludes a fully-paid invoice', async () => {
      readPort.seed(CENTER, makeRow({ month: '2026-05', totalMad: 35000, netPaidMad: 35000 }));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toHaveLength(0);
    });

    it('excludes an invoice whose billing month is not yet due', async () => {
      // The clock reads 2026-08-15; August is due 2026-08-31, so it is not overdue yet.
      readPort.seed(CENTER, makeRow({ month: '2026-08', totalMad: 20000, netPaidMad: 0 }));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toHaveLength(0);
    });

    it('returns an empty result when the center has no issued invoices', async () => {
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toEqual([]);
      expect(result.agingSummary.every((bucket) => bucket.count === 0)).toBe(true);
    });

    it('surfaces a student with no linked guardian under a null-parent group instead of dropping it', async () => {
      readPort.seed(CENTER, makeRow({ month: '2026-05', totalMad: 20000, netPaidMad: 0, guardianIds: [] }));
      const result = await build().execute({ centerCode: CENTER });

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]?.parentId).toBeNull();
      expect(result.groups[0]?.parentName).toBeNull();
      expect(result.groups[0]?.totalOutstandingMad).toBe(20000);
    });

    it('fans a shared debt out to both guardians without double-counting the aging summary', async () => {
      const father = makeParent('Ahmed Benali');
      const mother = makeParent('Fatima Benali');
      await parents.save(father);
      await parents.save(mother);
      readPort.seed(
        CENTER,
        makeRow({ month: '2026-05', totalMad: 35000, netPaidMad: 0, guardianIds: [father.id, mother.id] }),
      );

      const result = await build().execute({ centerCode: CENTER });

      expect(result.groups).toHaveLength(2);
      expect(result.groups.every((group) => group.totalOutstandingMad === 35000)).toBe(true);
      const totalAcrossBuckets = result.agingSummary.reduce((sum, bucket) => sum + bucket.outstandingMad, 0);
      expect(totalAcrossBuckets).toBe(35000); // not double-counted despite appearing under 2 parents
    });

    it('a parent with two overdue students sees both, summed', async () => {
      const parent = makeParent('Ahmed Benali');
      await parents.save(parent);
      readPort.seed(CENTER, makeRow({ month: '2026-05', totalMad: 20000, netPaidMad: 0, guardianIds: [parent.id] }));
      readPort.seed(CENTER, makeRow({ month: '2026-06', totalMad: 15000, netPaidMad: 0, guardianIds: [parent.id] }));

      const result = await build().execute({ centerCode: CENTER });

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]?.invoices).toHaveLength(2);
      expect(result.groups[0]?.totalOutstandingMad).toBe(35000);
    });

    it('never returns another center’s invoices', async () => {
      readPort.seed(OTHER_CENTER, makeRow({ month: '2026-05' }));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toEqual([]);
    });
  });

  describe('aging buckets', () => {
    it('buckets three different-age invoices across their aging tiers', async () => {
      // Clock: 2026-08-15. Due dates chosen so days-overdue lands in distinct tiers.
      readPort.seed(CENTER, makeRow({ month: '2026-07' })); // due 2026-07-31 -> 15 days overdue
      readPort.seed(CENTER, makeRow({ month: '2026-06' })); // due 2026-06-30 -> 46 days overdue
      readPort.seed(CENTER, makeRow({ month: '2026-04' })); // due 2026-04-30 -> 107 days overdue

      const result = await build().execute({ centerCode: CENTER });
      const byBucket = new Map(result.agingSummary.map((b) => [b.bucket, b.count]));
      expect(byBucket.get('0-30')).toBe(1);
      expect(byBucket.get('31-60')).toBe(1);
      expect(byBucket.get('90-plus')).toBe(1);
    });

    // The invoice's billing month is always due on a month-end (invoiceDueDate),
    // so hitting an EXACT 30/60/90-day boundary requires picking `today` to match —
    // June 30 is the due date in all three; only `today` moves.
    it.each([
      { today: '2026-07-30T09:00:00Z', expectedDaysOverdue: 30, bucket: '0-30' },
      { today: '2026-08-29T09:00:00Z', expectedDaysOverdue: 60, bucket: '31-60' },
      { today: '2026-09-28T09:00:00Z', expectedDaysOverdue: 90, bucket: '61-90' },
    ])(
      'exactly $expectedDaysOverdue days overdue closes into the $bucket bucket',
      async ({ today, bucket }) => {
        readPort.seed(CENTER, makeRow({ month: '2026-06' }));
        const use = new ListOverdueInvoices(readPort, parents, fakeClock(today), new PlanPolicy(PLANS.essentiel));

        const result = await use.execute({ centerCode: CENTER });

        expect(result.groups[0]?.invoices[0]?.agingBucket).toBe(bucket);
      },
    );
  });

  describe('filters', () => {
    beforeEach(() => {
      readPort.seed(
        CENTER,
        makeRow({ month: '2026-05', totalMad: 10000, netPaidMad: 0, groupIds: [GROUP_A] }),
      );
      readPort.seed(
        CENTER,
        makeRow({ month: '2026-06', totalMad: 40000, netPaidMad: 10000, groupIds: [GROUP_B] }),
      );
    });

    it('filters by month', async () => {
      const result = await build().execute({ centerCode: CENTER, month: '2026-05' });
      const allInvoices = result.groups.flatMap((g) => g.invoices);
      expect(allInvoices).toHaveLength(1);
      expect(allInvoices[0]?.month).toBe('2026-05');
    });

    it('filters by group', async () => {
      const result = await build().execute({ centerCode: CENTER, groupId: GROUP_B });
      const allInvoices = result.groups.flatMap((g) => g.invoices);
      expect(allInvoices).toHaveLength(1);
      expect(allInvoices[0]?.month).toBe('2026-06');
    });

    it('filters by status (unpaid vs partially-paid)', async () => {
      const unpaid = await build().execute({ centerCode: CENTER, status: 'unpaid' });
      expect(unpaid.groups.flatMap((g) => g.invoices)).toHaveLength(1);
      expect(unpaid.groups.flatMap((g) => g.invoices)[0]?.month).toBe('2026-05');

      const partial = await build().execute({ centerCode: CENTER, status: 'partially-paid' });
      expect(partial.groups.flatMap((g) => g.invoices)).toHaveLength(1);
      expect(partial.groups.flatMap((g) => g.invoices)[0]?.month).toBe('2026-06');
    });

    it('filters by outstanding amount range', async () => {
      const result = await build().execute({ centerCode: CENTER, minOutstandingMad: 15000 });
      const allInvoices = result.groups.flatMap((g) => g.invoices);
      expect(allInvoices).toHaveLength(1);
      expect(allInvoices[0]?.outstandingMad).toBe(30000);

      const capped = await build().execute({ centerCode: CENTER, maxOutstandingMad: 20000 });
      const cappedInvoices = capped.groups.flatMap((g) => g.invoices);
      expect(cappedInvoices).toHaveLength(1);
      expect(cappedInvoices[0]?.outstandingMad).toBe(10000);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError without core.invoicing', async () => {
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
      await expect(build(planWithout).execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
