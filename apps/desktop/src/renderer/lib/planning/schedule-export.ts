import type { WeekRange } from './week-range';
import { mockScheduleExportGateway } from './mock-schedule-export-gateway';

/**
 * Which slice of the week the exported PDF renders — the full center grid, or
 * one room/teacher/group's schedule. Mirrors the `viewFilter` shape agreed with
 * the backend for the `schedule.exportWeekPdf` channel (SOU-107).
 */
export type ScheduleExportViewFilter =
  | { readonly kind: 'full' }
  | { readonly kind: 'room'; readonly roomId: string }
  | { readonly kind: 'teacher'; readonly teacherId: string }
  | { readonly kind: 'group'; readonly groupId: string };

export type ScheduleExportRequest = {
  readonly weekRange: WeekRange;
  readonly viewFilter: ScheduleExportViewFilter;
  readonly locale: 'fr' | 'ar';
};

/**
 * The seam the schedule export dialog depends on (Dependency Inversion). The
 * component calls this interface, never `window.api` directly, so the mock
 * adapter swaps for the real IPC one in a single place — exactly like
 * `InvoicesGateway`.
 *
 * ## Contract status (SOU-107)
 * Backed by the not-yet-published `schedule.exportWeekPdf` channel (save-dialog,
 * `{ savedPath }`) and its `schedule.printWeekPdf` counterpart (open-in-viewer,
 * `void`) — the same print/export pair `InvoicesGateway` and `PayslipGateway`
 * already expose. `centerCode` is intentionally absent from the request: every
 * existing channel injects it in main from the active center session, never
 * from the renderer (see `ipc-planner-gateway.ts`).
 */
export interface ScheduleExportGateway {
  /** Renders the schedule PDF in `request.locale` and opens it in the OS's default viewer. */
  print(request: ScheduleExportRequest): Promise<void>;
  /**
   * Renders the schedule PDF in `request.locale` and lets the user pick a save
   * location. `savedPath` is `null` when the save dialog was cancelled.
   */
  export(request: ScheduleExportRequest): Promise<{ savedPath: string | null }>;
}

// TODO(SOU-107): swap mock for the real schedule.exportWeekPdf / schedule.printWeekPdf
// IPC gateway once the backend channels land in shared/ipc/contract.ts.
export const scheduleExportGateway: ScheduleExportGateway = mockScheduleExportGateway;
