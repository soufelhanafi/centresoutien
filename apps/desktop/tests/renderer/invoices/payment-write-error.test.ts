import { describe, expect, it } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import { mapPaymentWriteError } from '../../../src/renderer/lib/invoices/payment-write-error';

describe('mapPaymentWriteError', () => {
  it.each(['payment-exceeds-balance', 'invoice-not-payable'] as const)(
    'decodes %s from the rejection message (the real IPC path)',
    (code) => {
      const encoded = encodeDomainError({ code, message: 'boom' });
      const rejection = new Error(`Error invoking remote method 'payment.record': Error: ${encoded}`);
      expect(mapPaymentWriteError(rejection)).toBe(code);
    },
  );

  it('returns null for an unrelated failure', () => {
    expect(mapPaymentWriteError(new Error('boom'))).toBeNull();
    expect(mapPaymentWriteError({ code: 'student-not-found' })).toBeNull();
  });
});
