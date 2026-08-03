import type { LocalizedName } from './session-options';
import { mockScheduleExportGateway } from './mock-schedule-export-gateway';

/**
 * Which slice of the planner grid the exported PDF renders — the full center
 * grid, or one room/teacher/group's schedule. Carries the display name(s)
 * alongside each id so the PDF renderer needs no extra lookup — sourced
 * directly from `useSessionFormOptions()`, the same data the picker itself
 * renders from. Field-for-field alias of the real `schedule.print`/
 * `schedule.export` channels' `scheduleExportViewFilterSchema` (SOU-107,
 * `shared/ipc/contract.ts` on `feature/SOU-107-domain`).
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
 * component calls this interface, never `window.api` directly, so the mock
 * adapter swaps for the real IPC one in a single place — exactly like
 * `InvoicesGateway`.
 *
 * ## Contract status (SOU-107)
 * `schedule.print` / `schedule.export` are published on `feature/SOU-107-domain`
 * (`shared/ipc/contract.ts`) but not yet merged into this branch — wiring the
 * real `IpcScheduleExportGateway` here would require `window.api.invoke` to
 * resolve those channels, which only exist once `IpcHandlers` (exhaustive over
 * every contract channel) gains their `main/composition-root.ts` registration,
 * outside this half's ownership. So this stays a same-shape mock until the
 * branches merge — swapping it is then the one-line change below. There is
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

// TODO(SOU-107): swap mock for the real IpcScheduleExportGateway (schedule.print /
// schedule.export) once feature/SOU-107-domain merges and registers their handlers.
export const scheduleExportGateway: ScheduleExportGateway = mockScheduleExportGateway;
