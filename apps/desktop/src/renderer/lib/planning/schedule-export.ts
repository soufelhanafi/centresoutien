import type { LocalizedName } from './session-options';
import { ipcScheduleExportGateway } from './ipc-schedule-export-gateway';

/**
 * Which slice of the planner grid the exported PDF renders — the full center
 * grid, or one room/teacher/group's schedule. Carries the display name(s)
 * alongside each id so the PDF renderer needs no extra lookup — sourced
 * directly from `useSessionFormOptions()`, the same data the picker itself
 * renders from. Field-for-field alias of the real `schedule.print`/
 * `schedule.export` channels' `scheduleExportViewFilterSchema` (SOU-107,
 * `shared/ipc/contract.ts`).
 */
export type ScheduleExportViewFilter =
  | { readonly scope: 'full' }
  | { readonly scope: 'room'; readonly roomId: string; readonly roomName: string }
  | { readonly scope: 'teacher'; readonly teacherId: string; readonly teacherName: LocalizedName }
  | {
      readonly scope: 'group';
      readonly groupId: string;
      readonly subjectName: LocalizedName | null;
      readonly level: string | null;
    };

export type ScheduleExportRequest = {
  readonly view: ScheduleExportViewFilter;
  readonly locale: 'fr' | 'ar';
};

/**
 * The seam the schedule export dialog depends on (Dependency Inversion). The
 * component calls this interface, never `window.api` directly, so the concrete
 * adapter is swappable in one place — exactly like `InvoicesGateway`. There is
 * deliberately no week range in the request: `WeeklyRecurringSession` is a
 * template (weekday + time, no calendar date), same as `session.week`.
 * `centerCode` is intentionally absent too — injected in main from the active
 * center session, never sent by the renderer (see `ipc-planner-gateway.ts`).
 */
export interface ScheduleExportGateway {
  /** Renders the schedule PDF in `request.locale` and opens it in the OS's default viewer. */
  print(request: ScheduleExportRequest): Promise<{ ok: true }>;
  /**
   * Renders the schedule PDF in `request.locale` and lets the user pick a save
   * location. `savedPath` is `null` when the save dialog was cancelled.
   */
  export(request: ScheduleExportRequest): Promise<{ savedPath: string | null }>;
}

export const scheduleExportGateway: ScheduleExportGateway = ipcScheduleExportGateway;
