import type { DayCloseReport } from '../../lib/day-close/day-close-report';

export type { DayCloseReport };

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
