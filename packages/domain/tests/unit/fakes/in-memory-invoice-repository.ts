import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { InvoiceRepository } from '../../../src/ports/invoice-repository';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { InvoiceLine } from '../../../src/entities/invoice-line';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, UserId } from '../../../src/value-objects/ids';
import type {
  InvoiceListRow,
  InvoiceListFilters,
  InvoiceListPage,
} from '../../../src/read-models/invoice-list-row';
import { INVOICE_LIST_MAX_PAGE_SIZE } from '../../../src/read-models/invoice-list-row';
import { invoiceTotalMad } from '../../../src/policies/invoice-total';
import { foldSearchText } from '../../../src/policies/search-text-folding';
import {
  InvoiceLineNotFoundError,
  InvoiceNotDraftError,
  InvoiceNotFoundError,
} from '../../../src/errors/invoice-errors';

/**
 * In-memory {@link InvoiceRepository} for unit tests. Inherits the soft-deletable
 * header surface (save / findById / softDelete / listChangedSince) and stores lines
 * in a parallel array, mirroring the SQLite adapter's two-table shape. Reads exclude
 * tombstones; line writes are draft-only (SOU-289), enforced here exactly like the
 * SQLite adapter so unit tests exercise the same contract.
 */
export class InMemoryInvoiceRepository
  extends InMemorySoftDeletableRepository<InvoiceId, Invoice>
  implements InvoiceRepository
{
  private readonly lines: InvoiceLine[] = [];
  private readonly netPaidByInvoice = new Map<InvoiceId, number>();
  private readonly studentNameById = new Map<StudentId, { fr: string; ar: string }>();

  async createDraft(invoice: Invoice, lines: readonly InvoiceLine[]): Promise<void> {
    await this.save(invoice);
    for (const line of lines) {
      this.lines.push(structuredClone(line));
    }
  }

  async appendLinesToDraft(invoiceId: InvoiceId, lines: readonly InvoiceLine[]): Promise<void> {
    this.assertLiveDraft(invoiceId);
    const billedKeys = new Set(
      this.lines
        .filter((line) => line.invoiceId === invoiceId && line.deletedAt === null)
        .map((line) => `${line.formulaId}::${line.kind}`),
    );
    for (const line of lines) {
      const key = `${line.formulaId}::${line.kind}`;
      if (billedKeys.has(key)) continue;
      billedKeys.add(key);
      this.lines.push(structuredClone(line));
    }
  }

  async updateDraftLineAmount(line: InvoiceLine): Promise<void> {
    this.assertLiveDraft(line.invoiceId);
    const index = this.lines.findIndex(
      (stored) =>
        stored.id === line.id && stored.invoiceId === line.invoiceId && stored.deletedAt === null,
    );
    const stored = index === -1 ? undefined : this.lines[index];
    if (stored === undefined) {
      throw new InvoiceLineNotFoundError(line.invoiceId, line.id);
    }
    this.lines[index] = {
      ...stored,
      amountMad: line.amountMad,
      updatedAt: line.updatedAt,
      updatedBy: line.updatedBy,
    };
  }

  private assertLiveDraft(invoiceId: InvoiceId): void {
    const invoice = this.all().find(
      (candidate) => candidate.id === invoiceId && candidate.deletedAt === null,
    );
    if (invoice === undefined) {
      throw new InvoiceNotFoundError(invoiceId);
    }
    if (invoice.status !== 'draft') {
      throw new InvoiceNotDraftError(invoiceId, invoice.status);
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

  /** test-only convenience: seed the student's bilingual name the `search` filter
   *  matches on — mirrors the SQLite adapter's students join without wiring a whole
   *  StudentRepository into this fake. Unknown students never match a search. */
  setStudentName(studentId: StudentId, name: { fr: string; ar: string }): void {
    this.studentNameById.set(studentId, name);
  }

  async listInvoices(centerCode: CenterCode, filters: InvoiceListFilters): Promise<InvoiceListPage> {
    const search = filters.search === undefined ? undefined : foldSearchText(filters.search);
    const matched = this.all()
      .filter((invoice) => invoice.deletedAt === null && invoice.centerCode === centerCode)
      .filter((invoice) => filters.month === undefined || invoice.month === filters.month)
      .filter((invoice) => filters.studentId === undefined || invoice.studentId === filters.studentId)
      .filter((invoice) => filters.invoiceId === undefined || invoice.id === filters.invoiceId)
      .filter((invoice) => filters.openOnly !== true || this.isOpen(invoice))
      .filter((invoice) => search === undefined || this.nameMatches(invoice.studentId, search))
      .map((invoice) => this.toRow(invoice));

    const paginated = filters.pageSize !== undefined;
    if (!paginated) {
      const rows = matched.sort(
        (a, b) =>
          b.invoice.month.localeCompare(a.invoice.month) ||
          b.invoice.createdAt.getTime() - a.invoice.createdAt.getTime(),
      );
      return { rows, nextCursor: null };
    }

    const cursor = filters.cursor;
    const pageSize = Math.min(Math.max(1, filters.pageSize ?? 1), INVOICE_LIST_MAX_PAGE_SIZE);
    const ordered = matched
      .filter((row) => cursor === undefined || row.invoice.id < cursor)
      .sort((a, b) => b.invoice.id.localeCompare(a.invoice.id));

    const rows = ordered.slice(0, pageSize);
    const nextCursor =
      ordered.length > pageSize ? (rows[rows.length - 1]?.invoice.id ?? null) : null;
    return { rows, nextCursor };
  }

  private toRow(invoice: Invoice): InvoiceListRow {
    const lines = this.lines
      .filter((line) => line.deletedAt === null && line.invoiceId === invoice.id)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((line) => structuredClone(line));
    const name = this.studentNameById.get(invoice.studentId);
    return {
      invoice,
      studentName: { fr: name?.fr ?? '', ar: name?.ar ?? '' },
      lines,
      totalMad: invoiceTotalMad(lines),
      netPaidMad: this.netPaidByInvoice.get(invoice.id) ?? 0,
    };
  }

  private isOpen(invoice: Invoice): boolean {
    if (invoice.status === 'cancelled') return false;
    const row = this.toRow(invoice);
    return row.totalMad - row.netPaidMad > 0;
  }

  private nameMatches(studentId: StudentId, foldedSearch: string): boolean {
    const name = this.studentNameById.get(studentId);
    if (name === undefined) return false;
    return (
      foldSearchText(name.fr).includes(foldedSearch) ||
      foldSearchText(name.ar).includes(foldedSearch)
    );
  }
}
