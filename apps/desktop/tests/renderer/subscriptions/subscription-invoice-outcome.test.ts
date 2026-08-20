import { describe, expect, it } from 'vitest';
import { mapSubscriptionInvoiceOutcome } from '../../../src/renderer/lib/subscriptions/subscription-invoice-outcome';

const INVOICE_ID = 'inv_00000000000000000000000001';
const PREFIX = 'students.subscription.wizard.invoice';

describe('mapSubscriptionInvoiceOutcome', () => {
  it.each(['created', 'line-appended'] as const)(
    'maps %s to a success with the invoice to open',
    (outcome) => {
      expect(mapSubscriptionInvoiceOutcome(outcome, INVOICE_ID)).toEqual({
        tone: 'success',
        messageKey: `${PREFIX}.ready`,
        invoiceId: INVOICE_ID,
      });
    },
  );

  it('maps already-billed to neutral info without a navigation target', () => {
    expect(mapSubscriptionInvoiceOutcome('already-billed', INVOICE_ID)).toEqual({
      tone: 'info',
      messageKey: `${PREFIX}.alreadyBilled`,
      invoiceId: null,
    });
  });

  it('maps issued-skipped to a visible warning (invoice already issued, handle manually)', () => {
    expect(mapSubscriptionInvoiceOutcome('issued-skipped', INVOICE_ID)).toEqual({
      tone: 'warning',
      messageKey: `${PREFIX}.issuedSkipped`,
      invoiceId: null,
    });
  });

  it('maps deferred-future-month to info (monthly batch will bill it)', () => {
    expect(mapSubscriptionInvoiceOutcome('deferred-future-month', null)).toEqual({
      tone: 'info',
      messageKey: `${PREFIX}.deferred`,
      invoiceId: null,
    });
  });

  it('maps formula-unresolved to a visible warning (subscription saved, no invoice)', () => {
    expect(mapSubscriptionInvoiceOutcome('formula-unresolved', null)).toEqual({
      tone: 'warning',
      messageKey: `${PREFIX}.notGenerated`,
      invoiceId: null,
    });
  });

  it('silences invoicing-unavailable (unreachable on shipped plans)', () => {
    expect(mapSubscriptionInvoiceOutcome('invoicing-unavailable', null)).toBeNull();
  });
});
