import type { IpcResponse } from '../../../shared/ipc/contract';
import type {
  AvailabilityRecheckGateway,
  AvailabilityRecheckResult,
  OutOfWindowOccurrenceView,
  OutOfWindowSessionView,
} from './availability-recheck-gateway';

type RecheckSessionDto = IpcResponse<'teacherAvailability.recheckSessions'>['sessions'][number];
type RecheckOccurrenceDto = IpcResponse<'teacherAvailability.recheckSessions'>['occurrences'][number];

function toOutOfWindowSession(session: RecheckSessionDto): OutOfWindowSessionView {
  return {
    sessionId: session.id,
    subjectName: session.subjectName,
    teacherName: session.teacherName,
    dayOfWeek: session.dayOfWeek,
    start: session.start,
    end: session.end,
  };
}

function toOutOfWindowOccurrence(occurrence: RecheckOccurrenceDto): OutOfWindowOccurrenceView {
  return {
    sessionId: occurrence.id,
    subjectName: occurrence.subjectName,
    teacherName: occurrence.teacherName,
    date: occurrence.date,
    start: occurrence.start,
    end: occurrence.end,
  };
}

// The real AvailabilityRecheckGateway: maps the post-save re-check onto the
// `teacherAvailability.recheckSessions` channel (SOU-283, SOU-287). No business
// logic — the `FindSessionsOutsideTeacherAvailability` use case behind the
// channel owns the plan gate and the window/exception comparison.
class IpcAvailabilityRecheckGateway implements AvailabilityRecheckGateway {
  async listOutOfWindowSessions(teacherId: string): Promise<AvailabilityRecheckResult> {
    const { sessions, occurrences } = await window.api.invoke('teacherAvailability.recheckSessions', {
      teacherId,
    });
    return {
      sessions: sessions.map(toOutOfWindowSession),
      occurrences: occurrences.map(toOutOfWindowOccurrence),
    };
  }
}

export const ipcAvailabilityRecheckGateway: AvailabilityRecheckGateway =
  new IpcAvailabilityRecheckGateway();
