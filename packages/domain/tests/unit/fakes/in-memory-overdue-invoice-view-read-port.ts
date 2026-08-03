import type { OverdueInvoiceViewReadPort } from '../../../src/ports/overdue-invoice-view-read-port';
import type { OverdueInvoiceLineView } from '../../../src/read-models/overdue-invoice-view';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link OverdueInvoiceViewReadPort} for unit tests. A plain array
 * the test seeds directly — this port has no persistence semantics of its own
 * (it is a read-only projection), so there is nothing to mirror from a SQLite
 * adapter beyond the center scoping.
 */
export class InMemoryOverdueInvoiceViewReadPort implements OverdueInvoiceViewReadPort {
  private readonly rows: (OverdueInvoiceLineView & { centerCode: CenterCode })[] = [];

  seed(centerCode: CenterCode, row: OverdueInvoiceLineView): void {
    this.rows.push({ ...row, centerCode });
  }

  async listIssuedInvoiceLines(centerCode: CenterCode): Promise<readonly OverdueInvoiceLineView[]> {
    return this.rows.filter((row) => row.centerCode === centerCode);
  }
}
