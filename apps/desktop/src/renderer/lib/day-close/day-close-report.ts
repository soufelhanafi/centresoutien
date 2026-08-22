import type { DayCloseReportDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of the end-of-day "Clôture du jour" report (SOU-300). A
 * direct alias of the boundary's `dayCloseReportViewSchema` (the single source of
 * truth in `shared/ipc/contract`), so the renderer shape can never drift from what
 * the `dayCloseReport.get` channel returns. FR-only; all money figures are integer
 * MAD centimes, matching the cash-desk takings.
 */
export type DayCloseReport = DayCloseReportDto;
