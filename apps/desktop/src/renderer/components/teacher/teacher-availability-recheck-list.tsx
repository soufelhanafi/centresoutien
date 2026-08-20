import { ScrollArea } from '@centresoutien/ui';
import type {
  OutOfWindowOccurrenceView,
  OutOfWindowSessionView,
} from '../../lib/teacher-availability/availability-recheck-gateway';
import { TeacherAvailabilityRecheckOccurrenceRow } from './teacher-availability-recheck-occurrence-row';
import { TeacherAvailabilityRecheckRow } from './teacher-availability-recheck-row';

type TeacherAvailabilityRecheckListProps = {
  sessions: readonly OutOfWindowSessionView[];
  occurrences: readonly OutOfWindowOccurrenceView[];
};

/** The scrollable list of stranded sessions rendered inside the recheck popup. */
export function TeacherAvailabilityRecheckList({
  sessions,
  occurrences,
}: TeacherAvailabilityRecheckListProps) {
  return (
    <ScrollArea className="max-h-[50vh]" contentClassName="pe-1">
      <ul className="space-y-2">
        {sessions.map((session) => (
          <TeacherAvailabilityRecheckRow key={session.sessionId} session={session} />
        ))}
        {occurrences.map((occurrence) => (
          <TeacherAvailabilityRecheckOccurrenceRow key={occurrence.sessionId} occurrence={occurrence} />
        ))}
      </ul>
    </ScrollArea>
  );
}
