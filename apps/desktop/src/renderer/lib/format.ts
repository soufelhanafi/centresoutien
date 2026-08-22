/** Locale-aware formatting helpers. Morocco uses Western digits in both locales. */

/**
 * Maps an app locale to its Morocco BCP-47 tag. The `-MA` region makes Arabic
 * render Western (Latin) digits, matching Moroccan usage across the app.
 */
export function bcp47(locale: string): string {
  return locale.startsWith('ar') ? 'ar-MA' : 'fr-MA';
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

/**
 * Formats the clock time of an ISO datetime ("14:05") in the active locale.
 * Used for the day-close encaissements list, where each row shows when the
 * payment was taken. Falls back to the raw string if it can't be parsed.
 */
export function formatIsoTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(bcp47(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/** Formats a `YYYY-MM` month for display ("septembre 2025"). Falls back to the raw string. */
export function formatMonth(value: string, locale: string): string {
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(bcp47(locale), { year: 'numeric', month: 'long' }).format(date);
}

/**
 * Last calendar day of a `YYYY-MM` month — the display-only due date of a
 * monthly invoice (billing is monthly, CLAUDE.md §7, so the month's end is the
 * implicit deadline). Falls back to the raw string.
 */
export function formatMonthEnd(value: string, locale: string): string {
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return new Intl.DateTimeFormat(bcp47(locale), { year: 'numeric', month: 'long', day: 'numeric' }).format(lastDay);
}

/** Formats an integer MAD centimes amount as currency (CLAUDE.md §8: never hand-formatted). */
export function formatMoneyMad(amountCentimes: number, locale: string): string {
  return new Intl.NumberFormat(bcp47(locale), { style: 'currency', currency: 'MAD' }).format(
    amountCentimes / 100,
  );
}

/** Formats a `YYYY-MM` month as a short label for chart axes ("juil."). */
export function formatMonthShort(value: string, locale: string): string {
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(bcp47(locale), { month: 'short' }).format(date);
}

/** Formats percentage points (e.g. `30` for 30%) via `Intl.NumberFormat`, not a 0..1 fraction. */
export function formatPercent(percent: number, locale: string): string {
  return new Intl.NumberFormat(bcp47(locale), { style: 'percent', maximumFractionDigits: 2 }).format(
    percent / 100,
  );
}

/**
 * Formats a `YYYY-MM` month as its long name only ("juin" — no year), the shape
 * the Basique delta line needs ("▲ +6,2 % vs juin"). Falls back to the raw string.
 */
export function formatMonthName(value: string, locale: string): string {
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(bcp47(locale), { month: 'long' }).format(date);
}

/**
 * Splits an integer MAD-centimes amount into its locale-formatted integer
 * figure and its currency label ("48 250" + "MAD" under fr-MA, "د.م." under
 * ar-MA). The Basique cards render the figure big and the unit small
 * (design 1b), so `formatMoneyMad`'s single-string form can't be reused here.
 */
export function formatMadParts(amountCentimes: number, locale: string): { amount: string; unit: string } {
  const parts = new Intl.NumberFormat(bcp47(locale), {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: 0,
  }).formatToParts(amountCentimes / 100);
  let amount = '';
  let unit = '';
  for (const part of parts) {
    if (part.type === 'currency') {
      unit += part.value;
    } else if (part.type !== 'literal') {
      amount += part.value;
    }
  }
  return { amount, unit };
}

/**
 * Formats a signed percent change with one decimal ("+6,2 %", "-3,5 %") — the
 * Basique Argent delta line. `value` is percentage points (6.2 for 6.2%),
 * matching the domain's `MoneyDelta.deltaPercent`.
 */
export function formatSignedPercent(percentPoints: number, locale: string): string {
  return new Intl.NumberFormat(bcp47(locale), {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(percentPoints / 100);
}

/**
 * Formats a signed integer MAD-centimes difference as a whole-MAD figure
 * ("+1 150", "-450") — the Impayé card's absolute diff line (design 1b).
 */
export function formatSignedMad(diffCentimes: number, locale: string): string {
  return new Intl.NumberFormat(bcp47(locale), {
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  }).format(diffCentimes / 100);
}

/** Formats a duration in minutes as "16h30" / "53h30" (design 1b — no locale separator). */
export function formatHoursMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

/** Formats a whole count via `Intl.NumberFormat` (locale grouping) — never a raw `${n}` in copy. */
export function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(bcp47(locale), { maximumFractionDigits: 0 }).format(value);
}
