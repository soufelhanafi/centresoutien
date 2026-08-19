import { describe, it, expect } from 'vitest';
import {
  aggregateParentStatement,
  type ParentStatementContribution,
} from '../../../src/policies/parent-statement-aggregation';
import type { InvoiceStatus } from '../../../src/entities/invoice';

function contribution(
  invoiceStatus: InvoiceStatus | null,
  childTotalMad: number,
  childNetPaidMad: number,
): ParentStatementContribution {
  return {
    invoiceStatus,
    childTotalMad,
    childNetPaidMad,
    childOutstandingMad: Math.max(0, childTotalMad - childNetPaidMad),
  };
}

describe('aggregateParentStatement', () => {
  it('is an empty, unpaid statement when there are no contributions', () => {
    expect(aggregateParentStatement([])).toEqual({
      grandTotalMad: 0,
      totalReceivedMad: 0,
      outstandingMad: 0,
      aggregateStatus: 'unpaid',
    });
  });

  it('is unpaid when nothing has been received', () => {
    const result = aggregateParentStatement([contribution('issued', 30000, 0)]);
    expect(result.aggregateStatus).toBe('unpaid');
    expect(result.outstandingMad).toBe(30000);
    expect(result.totalReceivedMad).toBe(0);
  });

  it('is partially-paid when some but not all is received', () => {
    const result = aggregateParentStatement([contribution('issued', 30000, 12000)]);
    expect(result.aggregateStatus).toBe('partially-paid');
    expect(result.outstandingMad).toBe(18000);
  });

  it('is paid once every money-bearing child is settled', () => {
    const result = aggregateParentStatement([
      contribution('issued', 30000, 30000),
      contribution('issued', 20000, 20000),
    ]);
    expect(result).toEqual({
      grandTotalMad: 50000,
      totalReceivedMad: 50000,
      outstandingMad: 0,
      aggregateStatus: 'paid',
    });
  });

  it('excludes a cancelled child invoice from the money', () => {
    const result = aggregateParentStatement([
      contribution('issued', 30000, 30000),
      contribution('cancelled', 99000, 0),
    ]);
    expect(result.grandTotalMad).toBe(30000);
    expect(result.outstandingMad).toBe(0);
    expect(result.aggregateStatus).toBe('paid');
  });

  it('treats a child with no invoice as a zero contribution', () => {
    const result = aggregateParentStatement([
      contribution('issued', 30000, 30000),
      contribution(null, 0, 0),
    ]);
    expect(result.grandTotalMad).toBe(30000);
    expect(result.aggregateStatus).toBe('paid');
  });

  it('clamps an overpaying sibling: it neither masks a debt nor inflates the receipt, and the lines reconcile', () => {
    const result = aggregateParentStatement([
      contribution('issued', 30000, 40000), // overpaid: net exceeds this child's own total
      contribution('issued', 30000, 0),
    ]);
    expect(result.grandTotalMad).toBe(60000);
    expect(result.totalReceivedMad).toBe(30000);
    expect(result.outstandingMad).toBe(30000);
    expect(result.aggregateStatus).toBe('partially-paid');
    expect(result.grandTotalMad - result.totalReceivedMad).toBe(result.outstandingMad);
  });
});
