import type { InvoiceLayoutWriter } from './invoice-layout-writer';
import type { InvoicePdfLabels } from './invoice-pdf-labels';

/** Bundles the two things every section-drawing function needs, so they take
 *  one parameter instead of several (component-size-limits: max 3 params). */
export type PdfRenderContext = {
  writer: InvoiceLayoutWriter;
  labels: InvoicePdfLabels;
};
