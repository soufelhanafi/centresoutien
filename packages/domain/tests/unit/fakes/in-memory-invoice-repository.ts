import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { InvoiceRepository } from '../../../src/ports/invoice-repository';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { InvoiceLine } from '../../../src/entities/invoice-line';
import type { StudentId } from '../../../src/entities/student';

/**
 * In-memory {@link InvoiceRepository} for unit tests. Inherits the soft-deletable
 * header surface (save / findById / softDelete / listChangedSince) and stores lines
 * in a parallel array, mirroring the SQLite adapter's two-table shape. Reads exclude
 * tombstones; there is no line-update path — `createDraft` is the only writer of lines.
 */
export class InMemoryInvoiceRepository
  extends InMemorySoftDeletableRepository<InvoiceId, Invoice>
  implements InvoiceRepository
{
  private readonly lines: InvoiceLine[] = [];

  async createDraft(invoice: Invoice, lines: readonly InvoiceLine[]): Promise<void> {
    await this.save(invoice);
    for (const line of lines) {
      this.lines.push(structuredClone(line));
    }
  }

  async listLines(invoiceId: InvoiceId): Promise<readonly InvoiceLine[]> {
    return this.lines
      .filter((line) => line.deletedAt === null && line.invoiceId === invoiceId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((line) => structuredClone(line));
  }

  async findByStudentMonth(studentId: StudentId, month: string): Promise<Invoice | null> {
    const found = this.all().find(
      (invoice) =>
        invoice.deletedAt === null &&
        invoice.studentId === studentId &&
        invoice.month === month,
    );
    return found ? structuredClone(found) : null;
  }

  async listLinesChangedSince(cursor: Date): Promise<readonly InvoiceLine[]> {
    return this.lines
      .filter((line) => line.updatedAt.getTime() > cursor.getTime())
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((line) => structuredClone(line));
  }

  /** test-only convenience */
  allLines(): readonly InvoiceLine[] {
    return this.lines.map((line) => structuredClone(line));
  }
}
