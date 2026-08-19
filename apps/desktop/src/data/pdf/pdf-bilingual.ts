/** Picks the locale's side of a bilingual snapshot for a byte-generated PDF
 *  (payslip / payment receipt, still FR/AR). The invoice PDF is FR-only
 *  (SOU-279) and does not use this. */
export function bilingualLabel(value: { fr: string; ar: string }, locale: 'fr' | 'ar'): string {
  return value[locale];
}
