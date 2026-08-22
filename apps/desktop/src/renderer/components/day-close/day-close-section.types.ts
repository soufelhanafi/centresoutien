// contract mirror — replaced by the domain type on integration (SOU-300 backend owns `DayCloseReport`).
export type DayCloseReport = {
  day: string;
  newSubscriptions: { regular: number; examPrep: number; total: number };
  studentsEnrolled: number;
  invoicesGenerated: { count: number; totalBilledMad: number };
  totalCollectedMad: number;
  collectedByMethod: { cash: number; cheque: number; transfer: number; other: number };
  encaissements: ReadonlyArray<{ studentName: string; amountMad: number; at: string }>;
};

/** Export/print controls, grouped to keep the section's prop count under the ceiling. */
export type DayCloseActions = {
  onExport: () => void;
  onPrint: () => void;
  isExporting: boolean;
  isPrinting: boolean;
};

/** Business-day selection, grouped so the section stays a pure presentational surface. */
export type DayCloseDateSelection = {
  day: string;
  /** Today's `YYYY-MM-DD`: the input's upper bound so no future day is selectable. */
  maxDay: string;
  onChange: (day: string) => void;
};

export type DayCloseSectionProps = {
  date: DayCloseDateSelection;
  report: DayCloseReport | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  actions: DayCloseActions;
};
