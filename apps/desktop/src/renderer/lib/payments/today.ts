/**
 * The current local calendar day as `'YYYY-MM-DD'` — the `paidOn` window bound
 * for "today's takings". Mirrors the `today()` helper in `record-payment-dialog`
 * (the repo has no shared clock util in the renderer); a day-granular business
 * date, never a sync input.
 */
export function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
