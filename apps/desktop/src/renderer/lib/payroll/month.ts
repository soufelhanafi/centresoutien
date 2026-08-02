/** The current calendar month, `YYYY-MM` — the dashboard's default month. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
