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
  teacherId: z.string().nullable(),
  teacherName: bilingualTextSchema.nullable(),
  groupId: z.string().nullable(),
  subjectId: z.string().nullable(),
  subjectName: bilingualTextSchema.nullable(),
  level: z.string().nullable(),
  kind: z.enum(['regular', 'exam-prep']),
});
