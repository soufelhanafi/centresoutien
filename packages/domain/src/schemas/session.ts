import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { WEEKLY_RECURRING_SESSION_ID_PREFIX } from '../entities/weekly-recurring-session';
import { GENERATION_BATCH_ID_PREFIX } from '../entities/session';
import { isCalendarDate } from './student';

/**
 * Input schema for `GenerateAndPersistSessions` — the request that materializes a
 * recurrence template's concrete dated occurrences over a window. The envelope
 * (deviceOrigin, updatedBy) and the centerCode are stamped by main, never sent by
 * the renderer.
 *
 * `recurringSessionId` is checked for its `wrs_` prefix only; that it resolves to
 * a live, same-center template is the use case's job (a schema is pure and
 * entity-local). `from` / `to` are strict `YYYY-MM-DD` civil dates (real
 * month/day, leap-year aware) and `to` may not precede `from` — an empty window
 * is allowed (`from === to` materializes a single day; a backwards range is
 * rejected up front rather than silently yielding nothing).
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each via `t(\`errors.${code}\`)`.
 */
const recurringRef = z
  .string()
  .refine((value) => hasIdPrefix(value, WEEKLY_RECURRING_SESSION_ID_PREFIX), {
    message: 'invalid-id',
  });

const calendarDate = z.string().refine(isCalendarDate, { message: 'invalid-date' });

export const generateSessionsSchema = z
  .object({
    recurringSessionId: recurringRef,
    from: calendarDate,
    to: calendarDate,
    // Dates to materialize despite falling on a holiday (SOU-161). Optional —
    // omitting it (or sending an empty array) skips every holiday date, exactly
    // as before this field existed.
    overrideHolidayDates: z.array(calendarDate).optional(),
  })
  .refine((v) => v.to >= v.from, { message: 'end-before-start', path: ['to'] });

export type GenerateSessionsRequest = z.infer<typeof generateSessionsSchema>;

/**
 * Input schema for `UndoGenerationBatch` (SOU-160) — bulk-cancels every session
 * one generator run produced. `generationBatchId` is checked for its `gen_`
 * prefix only; that it resolves to a live, same-center batch is the use case's
 * job. `centerCode`/`updatedBy` are stamped by main, never sent by the renderer.
 */
export const undoGenerationBatchSchema = z.object({
  generationBatchId: z
    .string()
    .refine((value) => hasIdPrefix(value, GENERATION_BATCH_ID_PREFIX), { message: 'invalid-id' }),
});

export type UndoGenerationBatchRequest = z.infer<typeof undoGenerationBatchSchema>;
