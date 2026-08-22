import type { DayCloseReport } from '../read-models/day-close-report';

/**
 * Everything the day-close PDF needs to lay out its single A4 page (SOU-300) —
 * assembled by the caller (the `dayCloseReport.print` / `.export` IPC handlers)
 * from {@link GetDayCloseReport}'s result and the center profile. A plain data
 * contract, not a domain decision: it carries the already-derived report figures
 * verbatim, plus the center header and the moment the PDF was produced. FR-only —
 * there is no `locale`, unlike {@link InvoicePdfInput}.
 */
export type DayCloseReportPdfInput = {
  report: DayCloseReport;
  generatedAt: Date;
  center: {
    name: string;
    address: string;
    phone: string;
    email: string;
    /** Raw image bytes (PNG or JPEG) of the center's logo, or `null` when unset. */
    logoBytes: Uint8Array | null;
  };
};

/**
 * Port for rendering the day-close report to a printable PDF (SOU-300). The
 * concrete adapter (`pdf-lib`, desktop-only today) lives in
 * `apps/desktop/src/data/pdf/`; the domain only declares the contract so the
 * composition root can wire it like any other adapter. `render`'s *content* must
 * depend only on `input` — no hidden state beyond the PDF library's own save-time
 * metadata.
 */
export interface DayCloseReportPdfRenderer {
  render(input: DayCloseReportPdfInput): Promise<Uint8Array>;
}
