import { z } from 'zod';

// Shared view-schema primitives, split out of `contract.ts` so the
// teacher-availability and schedule read schemas can import them without a cycle.

// The shared bilingual `{ fr, ar }` label used across the read models.
export const bilingualTextSchema = z.object({ fr: z.string(), ar: z.string() });

// One opening window (SOU-165), 24h `'HH:mm'`. Several per weekday model an iftar
// or mid-day break. Reused by the center-hours view, the override view, and the
// generator's skipped-hours report.
export const timeWindowViewSchema = z.object({ open: z.string(), close: z.string() });

// The seven weekday window lists as a `0..6`-keyed record (the renderer aliases
// `Record<0..6, TimeWindow[]>`); a weekday's empty list is a closed day. Reused by
// the override view, the teacher-availability view, and the save request so both
// sides share one shape.
export const hoursByWeekdayViewSchema = z.object({
  0: z.array(timeWindowViewSchema),
  1: z.array(timeWindowViewSchema),
  2: z.array(timeWindowViewSchema),
  3: z.array(timeWindowViewSchema),
  4: z.array(timeWindowViewSchema),
  5: z.array(timeWindowViewSchema),
  6: z.array(timeWindowViewSchema),
});

// The presentation projection of a weekly recurring session across the IPC
// boundary — the enriched planner read model (SOU-118), aligned field-for-field
// with the domain `WeeklySessionView`. The sync envelope is stripped; there are no
// Dates (times are wall-clock `'HH:mm'` strings). The join-derived fields degrade
// to their neutral fallback rather than dropping the row: room/teacher names are
// null when unassigned/archived/not-yet-synced; group/subject/level are null when
// the session has no live group; `kind` falls back to `'regular'`. Single source
// of truth for the renderer's `WeeklySessionView` type.
export const weeklySessionViewSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  start: z.string(),
  end: z.string(),
  roomId: z.string(),
  roomName: z.string().nullable(),
  teacherId: z.string().nullable(),
  teacherName: bilingualTextSchema.nullable(),
  groupId: z.string().nullable(),
  subjectId: z.string().nullable(),
  subjectName: bilingualTextSchema.nullable(),
  level: z.string().nullable(),
  kind: z.enum(['regular', 'exam-prep']),
});

// The enriched projection of a concrete dated occurrence (SOU-201) — the dated
// sibling of `weeklySessionViewSchema`, mirroring the domain `SessionOccurrenceView`.
// The audit report renders names, not raw ids, so this carries the room/teacher/
// subject/group joins alongside the raw `date`/`start`/`end`. Join-derived fields
// degrade to their neutral fallback rather than dropping the occurrence. Envelope
// stripped; times are wall-clock `'HH:mm'` strings, `date` a `YYYY-MM-DD` civil date.
export const sessionOccurrenceViewSchema = z.object({
  id: z.string(),
  recurringSessionId: z.string(),
  date: z.string(),
  start: z.string(),
  end: z.string(),
  roomId: z.string(),
  roomName: z.string().nullable(),
  roomCapacity: z.number().nullable(),
  roomArchived: z.boolean(),
  teacherId: z.string().nullable(),
  teacherName: bilingualTextSchema.nullable(),
  groupId: z.string().nullable(),
  subjectId: z.string().nullable(),
  subjectName: bilingualTextSchema.nullable(),
  level: z.string().nullable(),
  kind: z.enum(['regular', 'exam-prep']),
});

// The director's end-of-day "Clôture du jour" report (SOU-300) across the IPC
// boundary — a read-only summary of one business day, FR-only. `newSubscriptions`
// splits new StudentSubscriptions by formula kind; `studentsEnrolled` counts new
// enrollments; `invoicesGenerated` is the issued-invoice count + total billed (MAD
// centimes); `totalCollectedMad`/`collectedByMethod` mirror the cash-desk day
// takings (all four method keys always present); `encaissements` is the day's
// collected `payment`-kind rows (reversals excluded). Single source of truth for
// the renderer's `DayCloseReport` type. Mirrors the domain `DayCloseReport`.
export const dayCloseReportViewSchema = z.object({
  day: z.string(),
  newSubscriptions: z.object({
    regular: z.number().int().nonnegative(),
    examPrep: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  studentsEnrolled: z.number().int().nonnegative(),
  invoicesGenerated: z.object({
    count: z.number().int().nonnegative(),
    totalBilledMad: z.number().int(),
  }),
  totalCollectedMad: z.number().int(),
  collectedByMethod: z.object({
    cash: z.number().int(),
    cheque: z.number().int(),
    transfer: z.number().int(),
    other: z.number().int(),
  }),
  encaissements: z.array(
    z.object({
      studentName: z.string(),
      amountMad: z.number().int(),
      at: z.string(),
    }),
  ),
});

// The eight audit reason codes (SOU-296) — mirrors the domain `SessionAuditReason`.
// Mapping to the issue's names: `teacher-unavailable` → `outside-teacher-availability`,
// `holiday/blackout` → `on-holiday`. `student-double-booked`: a student enrolled in
// two independent groups whose sessions land at an overlapping date+time — invisible
// to the room/teacher checks, since a shared student sits outside both resources.
export const sessionAuditReasonSchema = z.enum([
  'outside-center-hours',
  'on-holiday',
  'outside-teacher-availability',
  'teacher-double-booked',
  'room-double-booked',
  'student-double-booked',
  'room-archived',
  'room-over-capacity',
]);

// One stranded occurrence (SOU-296): the enriched occurrence plus every reason it
// is now stranded — several at once (double-booked AND over-capacity) is allowed.
export const strandedSessionSchema = z.object({
  session: sessionOccurrenceViewSchema,
  reasons: z.array(sessionAuditReasonSchema),
});

// One deduplicated audit group (SOU-262/296): every stranded occurrence sharing
// `(reason, weekday, resource)` — `resourceId` names the teacher/room (null for
// center-wide findings). `count` is the number of occurrences actually stranded.
export const strandedSessionGroupSchema = z.object({
  key: z.string(),
  reason: sessionAuditReasonSchema,
  weekday: z.number().int().min(0).max(6),
  resourceKind: z.enum(['room', 'teacher', 'group', 'center']),
  resourceId: z.string().nullable(),
  count: z.number().int(),
  occurrences: z.array(strandedSessionSchema),
});

// A live weekly template a teacher-availability edit now strands (SOU-296bis),
// flagged before any concrete occurrence of it is materialized — the recurring
// sibling of `strandedSessionSchema`, always for reason `outside-teacher-availability`.
export const strandedRecurringSlotSchema = z.object({
  session: weeklySessionViewSchema,
});
