/**
 * Formats an integer MAD-centimes amount for a PDF: `DH` suffix in French,
 * `د.م.` in Arabic (SOU-69 done-when) — always with Western (Latin) digits,
 * matching how Moroccan invoices are actually written in Arabic. Pass an
 * explicit `currencySuffix` to override the locale default (the SOU-279 invoice
 * uses the full `MAD` code, e.g. `2 520,00 MAD`); payslip/receipt keep `DH`.
 */
export function formatMad(amountMad: number, locale: 'fr' | 'ar', currencySuffix?: string): string {
  const amount = amountMad / 100;
  const numberLocale = locale === 'ar' ? 'ar-MA' : 'fr-MA';
  const formatted = new Intl.NumberFormat(numberLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: 'latn',
  }).format(amount);
  const suffix = currencySuffix ?? (locale === 'ar' ? 'د.م.' : 'DH');
  return `${formatted} ${suffix}`;
}
