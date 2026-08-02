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
