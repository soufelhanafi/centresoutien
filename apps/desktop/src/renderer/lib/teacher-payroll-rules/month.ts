/**
 * `YYYY-MM` month arithmetic for the close-and-reopen flow (CLAUDE.md §6): a
 * rule change closes the current live rule the month before the replacement
 * starts. Presentation-only convenience — the domain re-derives and enforces
 * the actual non-overlap invariant server-side regardless of what this
 * computes.
 */

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The current calendar month as `YYYY-MM`, from the device clock. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function nextMonth(month: string): string {
  return shiftMonth(month, 1);
}

export function previousMonth(month: string): string {
  return shiftMonth(month, -1);
}
