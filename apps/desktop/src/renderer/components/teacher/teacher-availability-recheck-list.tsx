import { ScrollArea } from '@centresoutien/ui';
import type { OutOfWindowSessionView } from '../../lib/teacher-availability/availability-recheck-gateway';
import { TeacherAvailabilityRecheckRow } from './teacher-availability-recheck-row';

type TeacherAvailabilityRecheckListProps = {
  sessions: readonly OutOfWindowSessionView[];
};

/** The scrollable list of out-of-window sessions rendered inside the recheck popup. */
export function TeacherAvailabilityRecheckList({ sessions }: TeacherAvailabilityRecheckListProps) {
  return (
    <ScrollArea className="max-h-[50vh]" contentClassName="pe-1">
      <ul className="space-y-2">
        {sessions.map((session) => (
          <TeacherAvailabilityRecheckRow key={session.sessionId} session={session} />
        ))}
      </ul>
    </ScrollArea>
  );
}
