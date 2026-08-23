/** One printed center row of the multi-center stats report — the already-derived
 *  figures {@link MultiCenterStatsRow} carries, minus the internal `centreId`. */
export type MultiCenterStatsPdfRow = {
  readonly centerCode: string;
  readonly displayName: string;
  readonly revenueMad: number;
  readonly collectedMad: number;
  readonly studentCount: number;
  readonly unpaidRate: number | null;
  readonly momGrowthPercent: number | null;
  readonly unavailable: boolean;
};

/** The whole-install totals block printed in the report header. */
export type MultiCenterStatsPdfTotals = {
  readonly centerCount: number;
  readonly availableCenterCount: number;
  readonly revenueMad: number;
  readonly collectedMad: number;
  readonly studentCount: number;
  readonly unpaidRate: number | null;
};

/**
 * Everything the multi-center stats owner report needs to lay out (SOU-106),
 * assembled by the caller (the `multiCenterStats.print` / `.export` IPC handlers)
 * from {@link GetMultiCenterStats}. A plain data contract, not a domain decision:
 * every money/rate here is already derived; the renderer's only job is typography
 * and layout. Sibling of {@link ParentStatementPdfInput}. `locale` picks the PDF's
 * language independent of the app's active UI locale (the concrete FR/AR labels
 * live with the pdf-lib adapter, per the repo's PDF convention).
 */
export type MultiCenterStatsPdfInput = {
  readonly locale: 'fr' | 'ar';
  readonly month: string; // 'YYYY-MM'
  readonly rows: readonly MultiCenterStatsPdfRow[];
  readonly totals: MultiCenterStatsPdfTotals;
};

/**
 * Port for rendering the per-center stats owner report to a printable PDF
 * (SOU-106). The concrete adapter (`pdf-lib`, desktop-only today) lives in
 * `apps/desktop/src/data/pdf/`; the domain only declares the contract so the
 * composition root can wire it like any other adapter. `render`'s content must
 * depend only on `input` — no hidden state beyond the PDF library's own save-time
 * metadata.
 */
export interface MultiCenterStatsPdfRenderer {
  render(input: MultiCenterStatsPdfInput): Promise<Uint8Array>;
}
