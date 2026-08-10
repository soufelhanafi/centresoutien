/**
 * Local calendar date as `YYYY-MM-DD` — the reference the planner uses to ask
 * which override is in effect right now. Center opening hours are local wall-clock
 * (the domain's `TimeOfDay` carries no timezone), so the visible week is anchored
 * to the operator's local day, not UTC.
 */
export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(locale: string): Intl.DateTimeFormat {
  const cached = dateFormatters.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  dateFormatters.set(locale, formatter);
  return formatter;
}

/** Formats a `YYYY-MM-DD` string for display in the active locale (UTC-anchored). */
export function formatIsoDate(iso: string, locale: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return iso;
  return getDateFormatter(locale).format(new Date(Date.UTC(year, month - 1, day)));
}
