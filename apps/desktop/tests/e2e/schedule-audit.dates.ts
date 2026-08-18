// Pure date + Intl helpers for the SOU-201 schedule-audit e2e suite, extracted so
// they carry unit tests without dragging Playwright/Electron into the vitest run
// (SOU-268). This module imports nothing from the fixtures, the renderer, the
// domain, or @playwright/test — date math and Intl only.

export type Locale = 'fr' | 'ar';

// `YYYY-MM-DD` from LOCAL calendar components — never `toISOString`, which would
// shift the day across the UTC boundary (SOU-255 rule).
export function isoLocalDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// The next Monday STRICTLY after `base`. When `base` itself is a Monday it jumps a
// full week (+7), never returning the same day — the audit only surfaces live
// (non-past) occurrences, so both computed Mondays must stay in the future.
export function nextMondayStrictlyAfter(base: Date): Date {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const daysUntilMonday = (1 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return date;
}

// The date label exactly as the running app renders it: day + long month + year,
// space-separated. Moroccan Arabic (`ar-MA`) names August "غشت"; the app renders
// Arabic dates with LATIN digits, so `numberingSystem: 'latn'` is forced to match
// the live audit row (which `rowForDate` matches by `hasText`).
export function dateLabel(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'fr', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    numberingSystem: 'latn',
  }).format(date);
}

// The two materialized Mondays used across the suite, computed from the runtime
// clock — the next two Mondays strictly after today, both strictly future.
const firstMonday = nextMondayStrictlyAfter(new Date());
const secondMonday = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate() + 7);

// The two materialized Mondays as `YYYY-MM-DD`.
export const MONDAYS = { first: isoLocalDate(firstMonday), second: isoLocalDate(secondMonday) } as const;

// `session.generate` materializes every Monday within [from,to] inclusive.
export const SEED_FIRST_ONLY = { from: MONDAYS.first, to: MONDAYS.first } as const;
export const SEED_BOTH = { from: MONDAYS.first, to: MONDAYS.second } as const;

// Localized labels for the two Mondays, matched verbatim against the live audit rows.
export const DATE: Record<Locale, { first: string; second: string }> = {
  fr: { first: dateLabel(firstMonday, 'fr'), second: dateLabel(secondMonday, 'fr') },
  ar: { first: dateLabel(firstMonday, 'ar'), second: dateLabel(secondMonday, 'ar') },
};
