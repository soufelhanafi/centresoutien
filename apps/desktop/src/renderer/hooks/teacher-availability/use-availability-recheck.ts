import { useCallback, useRef, useState } from 'react';
import {
  availabilityRecheckGateway,
  type OutOfWindowOccurrenceView,
  type OutOfWindowSessionView,
} from '../../lib/teacher-availability/availability-recheck-gateway';

/**
 * Runs the post-save availability re-check (SOU-283, SOU-287) for one teacher and
 * holds the non-blocking summary popup's state — both out-of-window weekly
 * sessions and exception-covered dated occurrences. `check` is called after a
 * successful save (weekly windows or an absence); when it finds anything the new
 * rules strand, it opens the popup with it. The save itself is never blocked — a
 * re-check failure is swallowed so a transient read error never masks the
 * successful write. `dismiss` closes the popup; the admin decides what to do with
 * the listed sessions later. Rapid consecutive saves race their rechecks: only
 * the newest in-flight check may apply, so a slower older response never
 * overwrites the latest summary — and a newest-empty response clears and closes
 * a now-stale popup.
 */
export function useAvailabilityRecheck(teacherId: string) {
  const [sessions, setSessions] = useState<readonly OutOfWindowSessionView[]>([]);
  const [occurrences, setOccurrences] = useState<readonly OutOfWindowOccurrenceView[]>([]);
  const [open, setOpen] = useState(false);
  const generation = useRef(0);

  const check = useCallback(async () => {
    const requested = ++generation.current;
    try {
      const stranded = await availabilityRecheckGateway.listOutOfWindowSessions(teacherId);
      if (requested !== generation.current) return;
      setSessions(stranded.sessions);
      setOccurrences(stranded.occurrences);
      setOpen(stranded.sessions.length > 0 || stranded.occurrences.length > 0);
    } catch {
      // A re-check read failure must never surface as a save failure (SOU-283).
    }
  }, [teacherId]);

  const dismiss = useCallback(() => setOpen(false), []);

  return { sessions, occurrences, open, check, dismiss };
}
