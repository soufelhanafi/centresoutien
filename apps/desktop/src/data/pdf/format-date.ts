/**
 * Formats a `YYYY-MM-DD` calendar date as a localized day/month/year for a PDF
 * (mirrors the renderer's `formatDate` — kept as a separate copy since Data must
 * not import from Presentation). Parses at local midnight so the day never
 * shifts across time zones; falls back to the raw string if unparseable.
 */
export function formatDateLabel(value: string, locale: 'fr' | 'ar'): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const dateLocale = locale === 'ar' ? 'ar-MA' : 'fr-MA';
  return new Intl.DateTimeFormat(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}
