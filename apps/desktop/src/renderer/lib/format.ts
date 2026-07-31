/** Locale-aware formatting helpers. Morocco uses Western digits in both locales. */

/**
 * Maps an app locale to its Morocco BCP-47 tag. The `-MA` region makes Arabic
 * render Western (Latin) digits, matching Moroccan usage across the app.
 */
export function bcp47(locale: string): string {
  return locale === 'ar' ? 'ar-MA' : 'fr-MA';
}

/**
 * Formats a `YYYY-MM-DD` (or ISO) date for display. Parses the date-only form at
 * local midnight so the day never shifts across time zones. Falls back to the
 * raw string if it can't be parsed.
 */
export function formatDate(value: string, locale: string): string {
  const iso = value.length <= 10 ? `${value}T00:00:00` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(bcp47(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
