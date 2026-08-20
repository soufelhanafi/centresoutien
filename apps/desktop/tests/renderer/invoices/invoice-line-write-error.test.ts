import { describe, expect, it } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import { mapInvoiceLineWriteError } from '../../../src/renderer/lib/invoices/invoice-line-write-error';

describe('mapInvoiceLineWriteError', () => {
  it.each([
    'invoice-not-draft',
    'invoice-line-not-found',
    'invoice-not-found',
    'invalid-amount',
  ] as const)('decodes %s from the rejection message (the real IPC path)', (code) => {
    const encoded = encodeDomainError({ code, message: 'boom' });
    const rejection = new Error(`Error invoking remote method 'invoice.updateLineAmount': Error: ${encoded}`);
    expect(mapInvoiceLineWriteError(rejection)).toBe(code);
  });

  it('returns null for an unrelated failure', () => {
    expect(mapInvoiceLineWriteError(new Error('boom'))).toBeNull();
    expect(mapInvoiceLineWriteError({ code: 'payment-not-found' })).toBeNull();
  });
});
