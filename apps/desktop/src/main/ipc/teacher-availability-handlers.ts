import type {
  ArchiveTeacherAvailabilityException,
  FindSessionsOutsideTeacherAvailability,
  GetTeacherAvailability,
  SaveTeacherAvailability,
  SaveTeacherAvailabilityException,
  TeacherAvailability,
  TeacherAvailabilityException,
  TeacherAvailabilityExceptionId,
  TeacherId,
  CenterCode,
  DeviceId,
  UserId,
  WeekdayIndex,
} from '@centresoutien/domain';
import { TeacherAvailabilityExceptionNotFoundError } from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import { toSessionOccurrenceView, toWeeklySessionView } from './session-mappers';

/** Only the surface the teacher-availability channels need — a stub satisfies it in tests. */
export type TeacherAvailabilityHandlerDeps = {
  getTeacherAvailability: Pick<GetTeacherAvailability, 'execute'>;
  saveTeacherAvailability: Pick<SaveTeacherAvailability, 'execute'>;
  saveTeacherAvailabilityException: Pick<SaveTeacherAvailabilityException, 'execute'>;
  archiveTeacherAvailabilityException: Pick<ArchiveTeacherAvailabilityException, 'execute'>;
  findSessionsOutsideTeacherAvailability: Pick<FindSessionsOutsideTeacherAvailability, 'execute'>;
  envelopeContext: () => { centerCode: CenterCode; deviceOrigin: DeviceId; updatedBy: UserId };
};

/** Project a TeacherAvailability to its boundary DTO: envelope stripped, the
 *  `0..6`-keyed weekday window record passed through (SOU-259). */
function toTeacherAvailabilityView(availability: TeacherAvailability) {
  const dayWindows = (dayOfWeek: WeekdayIndex) =>
    availability.weeklyWindows[dayOfWeek].map((window) => ({ open: window.open, close: window.close }));
  return {
    id: availability.id,
    teacherId: availability.teacherId,
    weeklyWindows: {
      0: dayWindows(0),
      1: dayWindows(1),
      2: dayWindows(2),
      3: dayWindows(3),
      4: dayWindows(4),
      5: dayWindows(5),
      6: dayWindows(6),
    },
  };
}

/** Project a TeacherAvailabilityException to its boundary DTO (SOU-259). */
function toTeacherAvailabilityExceptionView(exception: TeacherAvailabilityException) {
  return {
    id: exception.id,
    teacherId: exception.teacherId,
    dateRange: { start: exception.dateRange.start, end: exception.dateRange.end },
    label: exception.label,
  };
}

// Teacher-availability IPC handlers (SOU-259, SOU-283, SOU-287), split out of
// `handlers.ts` to keep that file from growing further — spread into
// `createHandlers`'s return object. Each handler delegates to a pre-wired domain
// use case; it adds no business logic.
export function createTeacherAvailabilityHandlers(
  deps: TeacherAvailabilityHandlerDeps,
): Pick<
  IpcHandlers,
  | 'teacherAvailability.get'
  | 'teacherAvailability.save'
  | 'teacherAvailabilityException.save'
  | 'teacherAvailabilityException.archive'
  | 'teacherAvailability.recheckSessions'
> {
  return {
    'teacherAvailability.get': async (request) => {
      const view = await deps.getTeacherAvailability.execute({
        centerCode: deps.envelopeContext().centerCode,
        teacherId: request.teacherId as TeacherId,
      });
      return {
        availability: view.availability === null ? null : toTeacherAvailabilityView(view.availability),
        exceptions: view.exceptions.map(toTeacherAvailabilityExceptionView),
      };
    },
    'teacherAvailability.save': async (request) => {
      const availability = await deps.saveTeacherAvailability.execute({
        ...deps.envelopeContext(),
        teacherId: request.teacherId,
        weeklyWindows: request.weeklyWindows,
      });
      return { availability: toTeacherAvailabilityView(availability) };
    },
    'teacherAvailabilityException.save': async (request) => {
      const exception = await deps.saveTeacherAvailabilityException.execute({
        ...deps.envelopeContext(),
        ...(request.id !== undefined ? { id: request.id as TeacherAvailabilityExceptionId } : {}),
        teacherId: request.teacherId,
        dateRange: request.dateRange,
        label: request.label,
      });
      return { exception: toTeacherAvailabilityExceptionView(exception) };
    },
    'teacherAvailabilityException.archive': async (request) => {
      const { centerCode, updatedBy } = deps.envelopeContext();
      try {
        await deps.archiveTeacherAvailabilityException.execute({
          centerCode,
          exceptionId: request.id as TeacherAvailabilityExceptionId,
          updatedBy,
        });
      } catch (error) {
        // Idempotent at the boundary, mirroring centerHoursOverride.archive: an
        // unknown or already-archived absence already holds the desired end-state.
        if (!(error instanceof TeacherAvailabilityExceptionNotFoundError)) throw error;
      }
      return { ok: true };
    },
    'teacherAvailability.recheckSessions': async (request) => {
      const { sessions, occurrences } = await deps.findSessionsOutsideTeacherAvailability.execute({
        centerCode: deps.envelopeContext().centerCode,
        teacherId: request.teacherId as TeacherId,
      });
      return {
        sessions: sessions.map(toWeeklySessionView),
        occurrences: occurrences.map(toSessionOccurrenceView),
      };
    },
  };
}
