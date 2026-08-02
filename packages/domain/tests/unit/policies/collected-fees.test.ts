import { describe, it, expect } from 'vitest';
import { collectedLineAmounts } from '../../../src/policies/collected-fees';
import { newEnvelope } from '../../../src/entities/envelope';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { FormulaId } from '../../../src/entities/formula';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;
const FORMULA = 'fml_00000000000000000000000001' as FormulaId;

function line(id: string, amountMad: number): InvoiceLine {
  return {
    id: id as InvoiceLineId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock('2026-08-01T00:00:00Z')),
    invoiceId: INVOICE,
    formulaId: FORMULA,
    label: { fr: 'Math', ar: 'رياضيات' },
    kind: 'regular',
    amountMad,
  };
}

function byId(map: ReadonlyMap<InvoiceLineId, number>) {
  return Object.fromEntries(map);
}

describe('collectedLineAmounts', () => {
  it('collects nothing when net paid is zero (unpaid)', () => {
    const lines = [line('invl_00000000000000000000000001', 20000)];
    expect(byId(collectedLineAmounts(lines, 0))).toEqual({ invl_00000000000000000000000001: 0 });
  });

  it('collects every line in full when net paid covers the total (paid)', () => {
    const lines = [line('invl_00000000000000000000000001', 20000), line('invl_00000000000000000000000002', 15000)];
    expect(byId(collectedLineAmounts(lines, 35000))).toEqual({
      invl_00000000000000000000000001: 20000,
      invl_00000000000000000000000002: 15000,
    });
  });

  it('clamps an overpayment to each line’s own total rather than over-collecting', () => {
    const lines = [line('invl_00000000000000000000000001', 20000)];
    expect(byId(collectedLineAmounts(lines, 999999))).toEqual({ invl_00000000000000000000000001: 20000 });
  });

  it('prorates a partial payment across lines weighted by their own amount', () => {
    const lines = [line('invl_00000000000000000000000001', 20000), line('invl_00000000000000000000000002', 15000)];
    // net = 17500 = 50% of the 35000 total -> each line collects exactly half.
    expect(byId(collectedLineAmounts(lines, 17500))).toEqual({
      invl_00000000000000000000000001: 10000,
      invl_00000000000000000000000002: 7500,
    });
  });

  it('distributes the largest-remainder leftover so shares sum exactly to the net paid', () => {
    const lines = [
      line('invl_00000000000000000000000001', 10000),
      line('invl_00000000000000000000000002', 10000),
      line('invl_00000000000000000000000003', 10000),
    ];
    const shares = collectedLineAmounts(lines, 10000); // 1/3 of 30000, uneven split
    const sum = [...shares.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBe(10000);
    for (const v of shares.values()) {
      expect(v).toBeGreaterThanOrEqual(3333);
      expect(v).toBeLessThanOrEqual(3334);
    }
  });

  it('collects nothing for a fully-discounted (zero-total) invoice regardless of net paid', () => {
    const lines = [line('invl_00000000000000000000000001', 0)];
    expect(byId(collectedLineAmounts(lines, 500))).toEqual({ invl_00000000000000000000000001: 0 });
  });
});
