import type { GroupKind, TimeOfDay, WeekdayIndex } from '@centresoutien/domain';

/**
 * One planner block the schedule PDF draws — a trimmed projection of
 * {@link WeeklySessionView} carrying only what a print block renders (no id, no
 * `roomId`/`teacherId`/`groupId`: filtering by those already happened before this
 * type is built, mirroring how {@link ScheduleExportPdfInput.view} drops the raw
 * id once it has picked its rows).
 */
export type ScheduleExportSessionRow = {
  readonly dayOfWeek: WeekdayIndex;
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
  readonly roomName: string | null;
  readonly teacherName: { readonly fr: string; readonly ar: string } | null;
  readonly subjectId: string | null;
  readonly subjectName: { readonly fr: string; readonly ar: string } | null;
  readonly level: string | null;
  readonly kind: GroupKind;
};

/**
 * The four export scopes (SOU-107): `full` prints every live session, the other
 * three narrow to one room / teacher / group. Each narrowed scope carries its own
 * already-known display name rather than an id — the caller (the IPC assembly
 * step) has already filtered `sessions` by the matching id before building this
 * input, so the renderer never resolves an id to a name itself.
 */
export type ScheduleExportViewFilter =
  | { readonly scope: 'full' }
  | { readonly scope: 'room'; readonly roomName: string }
  | { readonly scope: 'teacher'; readonly teacherName: { readonly fr: string; readonly ar: string } }
  | {
      readonly scope: 'group';
      readonly subjectName: { readonly fr: string; readonly ar: string } | null;
      readonly level: string | null;
    };

/**
 * Everything the schedule PDF needs to lay out its A4-landscape page, assembled
 * by the IPC handler from {@link ListWeekSessions}'s already-fetched week plus
 * the center profile. `render`'s content must depend only on `input`, like every
 * other `pdf-lib` renderer in this folder.
 */
export type ScheduleExportPdfInput = {
  readonly locale: 'fr' | 'ar';
  readonly view: ScheduleExportViewFilter;
  readonly sessions: readonly ScheduleExportSessionRow[];
  readonly center: {
    readonly name: string;
    readonly logoBytes: Uint8Array | null;
  };
};
