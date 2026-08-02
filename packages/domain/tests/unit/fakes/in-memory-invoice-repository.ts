import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { InvoiceRepository } from '../../../src/ports/invoice-repository';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { InvoiceLine } from '../../../src/entities/invoice-line';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, UserId } from '../../../src/value-objects/ids';
import type { InvoiceListRow, InvoiceListFilters } from '../../../src/read-models/invoice-list-row';
import { invoiceTotalMad } from '../../../src/policies/invoice-total';

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
  private readonly netPaidByInvoice = new Map<InvoiceId, number>();

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

  // Cascade the tombstone to lines, mirroring the SQLite adapter so line-level reads in
  // unit tests match production: discarding an invoice tombstones its lines too.
  override async softDelete(id: InvoiceId, at: Date, by: UserId): Promise<void> {
    await super.softDelete(id, at, by);
    for (const line of this.lines) {
      if (line.invoiceId === id && line.deletedAt === null) {
        line.deletedAt = at;
        line.updatedAt = at;
        line.updatedBy = by;
      }
    }
  }

  async findByStudentMonth(
    centerCode: CenterCode,
    studentId: StudentId,
    month: string,
  ): Promise<Invoice | null> {
    const found = this.all().find(
      (invoice) =>
        invoice.deletedAt === null &&
        invoice.centerCode === centerCode &&
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

  async listByCenterMonth(centerCode: CenterCode, month: string): Promise<readonly Invoice[]> {
    return this.all().filter(
      (invoice) =>
        invoice.deletedAt === null && invoice.centerCode === centerCode && invoice.month === month,
    );
  }

  /** test-only convenience */
  allLines(): readonly InvoiceLine[] {
    return this.lines.map((line) => structuredClone(line));
  }

  /** test-only convenience: seed the net-paid figure `listInvoices` reports for
   *  an invoice — mirrors the SQLite adapter's payments-table join without
   *  wiring a whole PaymentRepository into this fake. Defaults to 0 (unpaid). */
  setNetPaid(invoiceId: InvoiceId, amountMad: number): void {
    this.netPaidByInvoice.set(invoiceId, amountMad);
  }

  async listInvoices(
    centerCode: CenterCode,
    filters: InvoiceListFilters,
  ): Promise<readonly InvoiceListRow[]> {
    const rows = this.all()
      .filter((invoice) => invoice.deletedAt === null && invoice.centerCode === centerCode)
      .filter((invoice) => filters.month === undefined || invoice.month === filters.month)
      .filter((invoice) => filters.studentId === undefined || invoice.studentId === filters.studentId)
      .filter((invoice) => filters.invoiceId === undefined || invoice.id === filters.invoiceId)
      .sort(
        (a, b) => b.month.localeCompare(a.month) || b.createdAt.getTime() - a.createdAt.getTime(),
      );

    return rows.map((invoice) => {
      const lines = this.lines
        .filter((line) => line.deletedAt === null && line.invoiceId === invoice.id)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((line) => structuredClone(line));
      return {
        invoice,
        lines,
        totalMad: invoiceTotalMad(lines),
        netPaidMad: this.netPaidByInvoice.get(invoice.id) ?? 0,
      };
    });
  }
}
