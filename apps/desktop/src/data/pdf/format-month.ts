/**
 * Formats a `YYYY-MM` invoice month as a localized month name for the PDF
 * (mirrors the renderer's `formatMonth` — kept as a separate copy since Data
 * must not import from Presentation).
 */
export function formatMonthLabel(month: string, locale: 'fr' | 'ar'): string {
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  const dateLocale = locale === 'ar' ? 'ar-MA' : 'fr-MA';
  return new Intl.DateTimeFormat(dateLocale, { year: 'numeric', month: 'long' }).format(date);
}

/**
 * Last calendar day of a `YYYY-MM` invoice month — the display-only due date of
 * a monthly invoice (billing is monthly, CLAUDE.md §7, so the month's end is the
 * implicit deadline). Falls back to the raw month when unparseable.
 */
export function formatMonthEndLabel(month: string, locale: 'fr' | 'ar'): string {
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const dateLocale = locale === 'ar' ? 'ar-MA' : 'fr-MA';
  return new Intl.DateTimeFormat(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' }).format(lastDay);
}
