import { z } from 'zod';
import {
  teacherAvailabilityExceptionInputSchema,
  teacherAvailabilityInputSchema,
} from '@centresoutien/domain';
import {
  hoursByWeekdayViewSchema,
  sessionOccurrenceViewSchema,
  weeklySessionViewSchema,
} from './view-schemas';

// The display shape of a teacher's weekly availability (SOU-259): envelope
// stripped, the `0..6`-keyed weekday window record passed through. `null` at
// the channel level means nothing configured — the teacher is unrestricted.
const teacherAvailabilityViewSchema = z.object({
  id: z.string(),
  teacherId: z.string(),
  weeklyWindows: hoursByWeekdayViewSchema,
});

// One one-off teacher absence (SOU-259): inclusive civil-date range plus the
// director's optional label. Envelope stripped.
const teacherAvailabilityExceptionViewSchema = z.object({
  id: z.string(),
  teacherId: z.string(),
  dateRange: z.object({ start: z.string(), end: z.string() }),
  label: z.string().nullable(),
});

// Teacher availability (SOU-259) — weekly windows + one-off absences, gated by
// `planning.teacher-availability` in the use cases; centerCode/device/user are
// injected in main, never sent. `get` reads one teacher's full picture in a
// single round trip (`availability: null` = unrestricted).
//
// `recheckSessions` (SOU-283, SOU-287): after saving a teacher's weekly windows
// OR a one-off absence, list that teacher's already-scheduled sessions the NEW
// rules now place outside availability — a non-blocking summary the availability
// screen shows so the admin can review the drift. `sessions` are the enriched
// `weeklySessionViewSchema` (same shape as `session.week`) now out of window;
// `occurrences` are the enriched `sessionOccurrenceViewSchema` dated occurrences a
// new absence now covers. A teacher with no configured row (unrestricted) returns
// empty `sessions`, but an absence still surfaces covered `occurrences`.
export const teacherAvailabilityIpcContract = {
  'teacherAvailability.get': {
    request: z.object({ teacherId: z.string().min(1) }),
    response: z.object({
      availability: teacherAvailabilityViewSchema.nullable(),
      exceptions: z.array(teacherAvailabilityExceptionViewSchema),
    }),
  },
  'teacherAvailability.save': {
    request: teacherAvailabilityInputSchema,
    response: z.object({ availability: teacherAvailabilityViewSchema }),
  },
  'teacherAvailabilityException.save': {
    request: teacherAvailabilityExceptionInputSchema.extend({ id: z.string().optional() }),
    response: z.object({ exception: teacherAvailabilityExceptionViewSchema }),
  },
  'teacherAvailabilityException.archive': {
    request: z.object({ id: z.string().min(1) }),
    response: z.object({ ok: z.literal(true) }),
  },
  'teacherAvailability.recheckSessions': {
    request: z.object({ teacherId: z.string().min(1) }),
    response: z.object({
      sessions: z.array(weeklySessionViewSchema),
      occurrences: z.array(sessionOccurrenceViewSchema),
    }),
  },
};
