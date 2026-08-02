import type { InvoicePdfWriter } from './invoice-pdf-writer';
import type { InvoicePdfLabels } from './invoice-pdf-labels';

/** Bundles the three things every section-drawing function needs, so they take
 *  one parameter instead of three (component-size-limits: max 3 params). */
export type PdfRenderContext = {
  writer: InvoicePdfWriter;
  labels: InvoicePdfLabels;
  locale: 'fr' | 'ar';
};

export function bilingualLabel(value: { fr: string; ar: string }, locale: 'fr' | 'ar'): string {
  return value[locale];
}
