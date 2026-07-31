import type { PaymentRepository } from '../../../src/ports/payment-repository';
import type { Payment, PaymentId } from '../../../src/entities/payment';
import type { InvoiceId } from '../../../src/entities/invoice';
import { netPaidMad } from '../../../src/policies/payment-status';

/**
 * In-memory {@link PaymentRepository} for unit tests. Mirrors the SQLite adapter's
 * append-only semantics: `append` is the only writer, re-appending an existing id throws
 * (like the plain INSERT), reads hide tombstones (though payments are never tombstoned),
 * and there is no update/delete path at all — the port doesn't expose one. `sumForInvoice`
 * reuses the pure `netPaidMad` so the fake and the SQL SUM stay in lockstep.
 */
export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly rows = new Map<PaymentId, Payment>();

  async append(payment: Payment): Promise<void> {
    if (this.rows.has(payment.id)) {
      throw new Error(`payment ${payment.id} already exists (append-only)`);
    }
    this.rows.set(payment.id, structuredClone(payment));
  }

  async findById(id: PaymentId): Promise<Payment | null> {
    const row = this.rows.get(id);
    if (!row || row.deletedAt !== null) return null;
    return structuredClone(row);
  }

  async listForInvoice(invoiceId: InvoiceId): Promise<readonly Payment[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.invoiceId === invoiceId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => structuredClone(row));
  }

  async sumForInvoice(invoiceId: InvoiceId): Promise<number> {
    return netPaidMad(await this.listForInvoice(invoiceId));
  }

  async listChangedSince(cursor: Date): Promise<readonly Payment[]> {
    return [...this.rows.values()]
      .filter((row) => row.updatedAt.getTime() > cursor.getTime())
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((row) => structuredClone(row));
  }

  /** test-only convenience */
  all(): readonly Payment[] {
    return [...this.rows.values()].map((row) => structuredClone(row));
  }
}
