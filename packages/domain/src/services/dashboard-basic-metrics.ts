import { addDays, weekdayOf } from '../value-objects/date-range';
import { paymentStatusOf } from '../policies/payment-status';
import type { Group } from '../entities/group';
import type { InvoiceListRow } from '../read-models/invoice-list-row';

type MonthlyMoney = {
  billedMad: number;
  collectedMad: number;
  unpaidMad: number;
  paidCount: number;
  totalCount: number;
};

/** UTC Monday of the ISO week containing `now` — the Basique "cette semaine". */
export function mondayOfWeek(now: Date): string {
  const today = now.toISOString().slice(0, 10);
  const daysSinceMonday = (weekdayOf(today) + 6) % 7;
  return addDays(today, -daysSinceMonday);
}

export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** The money roll-up one month contributes, over `issued` invoices only. */
export function monthlyMoney(rows: readonly InvoiceListRow[]): MonthlyMoney {
  let billedMad = 0;
  let collectedMad = 0;
  let paidCount = 0;
  let totalCount = 0;
  for (const row of rows) {
    if (row.invoice.status !== 'issued') continue;
    billedMad += row.totalMad;
    collectedMad += row.netPaidMad;
    totalCount += 1;
    if (paymentStatusOf(row.totalMad, row.netPaidMad) === 'paid') paidCount += 1;
  }
  return { billedMad, collectedMad, unpaidMad: billedMad - collectedMad, paidCount, totalCount };
}

/** A Group has no translated name of its own — its plain `level` string is
 *  duplicated into both scripts, the same convention `subjectUsageReference` uses. */
export function groupDisplayName(group: Group): { fr: string; ar: string } {
  return { fr: group.level, ar: group.level };
}
