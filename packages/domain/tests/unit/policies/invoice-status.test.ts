import { describe, it, expect } from 'vitest';
import {
  INVOICE_STATUS_TRANSITIONS,
  canTransitionInvoice,
} from '../../../src/policies/invoice-status';
import { INVOICE_STATUSES, type InvoiceStatus } from '../../../src/entities/invoice';

describe('invoice status state machine', () => {
  // The full transition matrix — every (from, to) pair of the 3 states, so a stray
  // edge added to INVOICE_STATUS_TRANSITIONS breaks a test here.
  const legal = new Set(['draft->issued', 'draft->cancelled', 'issued->cancelled']);
  const pairs: { from: InvoiceStatus; to: InvoiceStatus }[] = INVOICE_STATUSES.flatMap((from) =>
    INVOICE_STATUSES.map((to) => ({ from, to })),
  );

  it.each(pairs)('$from -> $to', ({ from, to }) => {
    expect(canTransitionInvoice(from, to)).toBe(legal.has(`${from}->${to}`));
  });

  describe('legal transitions', () => {
    it('allows draft -> issued (issue) and draft -> cancelled (discard)', () => {
      expect(canTransitionInvoice('draft', 'issued')).toBe(true);
      expect(canTransitionInvoice('draft', 'cancelled')).toBe(true);
    });

    it('allows issued -> cancelled (void an issued invoice)', () => {
      expect(canTransitionInvoice('issued', 'cancelled')).toBe(true);
    });
  });

  describe('illegal transitions', () => {
    it('forbids issued -> draft (an issued invoice is immutable, no re-open)', () => {
      expect(canTransitionInvoice('issued', 'draft')).toBe(false);
    });

    it('forbids issued -> issued and cancelled -> cancelled (no self-transition)', () => {
      expect(canTransitionInvoice('issued', 'issued')).toBe(false);
      expect(canTransitionInvoice('cancelled', 'cancelled')).toBe(false);
    });

    it('makes cancelled terminal (nothing leaves it)', () => {
      expect(INVOICE_STATUS_TRANSITIONS.cancelled).toEqual([]);
      expect(canTransitionInvoice('cancelled', 'draft')).toBe(false);
      expect(canTransitionInvoice('cancelled', 'issued')).toBe(false);
    });
  });
});
