import type { IpcResponse } from '../../../shared/ipc/contract';
import type {
  AvailabilityRecheckGateway,
  OutOfWindowSessionView,
} from './availability-recheck-gateway';

type RecheckSessionDto = IpcResponse<'teacherAvailability.recheckSessions'>['sessions'][number];

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

/**
 * The real {@link AvailabilityRecheckGateway}: maps the post-save re-check onto
 * the `teacherAvailability.recheckSessions` channel (SOU-283). No business logic —
 * the `FindSessionsOutsideTeacherAvailability` use case behind the channel owns
 * the plan gate and the window comparison, and a teacher with no configured row
 * returns `[]`. `centerCode` is injected in main, never sent from the renderer.
 * Projects each enriched `WeeklySessionDto` down to the popup's summary shape.
 */
class IpcAvailabilityRecheckGateway implements AvailabilityRecheckGateway {
  async listOutOfWindowSessions(teacherId: string): Promise<readonly OutOfWindowSessionView[]> {
    const { sessions } = await window.api.invoke('teacherAvailability.recheckSessions', {
      teacherId,
    });
    return sessions.map(toOutOfWindowSession);
  }
}

export const ipcAvailabilityRecheckGateway: AvailabilityRecheckGateway =
  new IpcAvailabilityRecheckGateway();
