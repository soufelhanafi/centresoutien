/** The current calendar month, `YYYY-MM` — the default subscribe/close month. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** The month right after `month` (`YYYY-MM`), rolling over the year boundary. */
export function nextMonth(month: string): string {
  const [yearPart, monthPart] = month.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart);
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 7);
}
