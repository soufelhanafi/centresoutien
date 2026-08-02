/**
 * Formats a percentage-points value (e.g. `30` for 30%) for the payslip PDF
 * via `Intl.NumberFormat`, always with Western (Latin) digits — mirrors
 * `formatMad`'s locale convention, capped to 2 fraction digits since
 * `TeacherPayrollRule.percent` is not constrained to an integer.
 */
export function formatPercent(percent: number, locale: 'fr' | 'ar'): string {
  const numberLocale = locale === 'ar' ? 'ar-MA' : 'fr-MA';
  return new Intl.NumberFormat(numberLocale, {
    style: 'percent',
    maximumFractionDigits: 2,
    numberingSystem: 'latn',
  }).format(percent / 100);
}
