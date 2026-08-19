import { useCallback, useState } from 'react';
import {
  availabilityRecheckGateway,
  type OutOfWindowSessionView,
} from '../../lib/teacher-availability/availability-recheck-gateway';

/**
 * Runs the post-save availability re-check (SOU-283) for one teacher and holds the
 * non-blocking summary popup's state. `check` is called after a successful save;
 * when it finds sessions the new week strands, it opens the popup with them. The
 * save itself is never blocked — a re-check failure is swallowed so a transient
 * read error never masks the successful write. `dismiss` closes the popup; the
 * admin decides what to do with the listed sessions later.
 */
export function useAvailabilityRecheck(teacherId: string) {
  const [sessions, setSessions] = useState<readonly OutOfWindowSessionView[]>([]);
  const [open, setOpen] = useState(false);

  const check = useCallback(async () => {
    try {
      const stranded = await availabilityRecheckGateway.listOutOfWindowSessions(teacherId);
      if (stranded.length > 0) {
        setSessions(stranded);
        setOpen(true);
      }
    } catch {
      // A re-check read failure must never surface as a save failure (SOU-283).
    }
  }, [teacherId]);

  const dismiss = useCallback(() => setOpen(false), []);

  return { sessions, open, check, dismiss };
}
