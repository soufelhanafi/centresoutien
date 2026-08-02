/**
 * Formats an integer MAD-centimes amount for the invoice PDF: `DH` suffix in
 * French, `د.م.` in Arabic (SOU-69 done-when) — always with Western (Latin)
 * digits, matching how Moroccan invoices are actually written in Arabic.
 */
export function formatMad(amountMad: number, locale: 'fr' | 'ar'): string {
  const amount = amountMad / 100;
  const numberLocale = locale === 'ar' ? 'ar-MA' : 'fr-MA';
  const formatted = new Intl.NumberFormat(numberLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: 'latn',
  }).format(amount);
  return locale === 'ar' ? `${formatted} د.م.` : `${formatted} DH`;
}
