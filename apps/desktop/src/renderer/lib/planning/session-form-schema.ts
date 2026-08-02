import { z } from 'zod';
import type { Control } from 'react-hook-form';
import { isTimeOfDay } from '@centresoutien/domain';

/**
 * The user-editable fields when creating or editing a weekly recurring session
 * (SOU-131): the weekday, the `[start, end)` time range, the room, and the
 * optional teacher/group. Validated by this schema so the form (via `zodResolver`)
 * enforces the shape before the write leaves the renderer.
 *
 * ## Renderer form schema — bound by shape to the domain contract
 *
 * The domain owns the wire contract (`weeklyRecurringSessionInputSchema` /
 * `WeeklyRecurringSessionInput` in `@centresoutien/domain`). This renderer schema
 * is deliberately kept separate — it validates the form's *pre-parse* shape (a
 * string `dayOfWeek` from the Radix Select) — and binds to that contract **by
 * shape**: {@link SessionInput} mirrors `WeeklyRecurringSessionInput`'s
 * user-editable subset (room required; teacher/group optional, null default;
 * `dayOfWeek` a **number**; no validity window / active — the IPC adapter fills
 * those wire defaults). {@link toSessionInput} bridges the form's string
 * `dayOfWeek` to the numeric contract value.
 *
 * Why a string `dayOfWeek` in the form: Radix Select values are strings, and
 * shadcn's `FormField` requires the schema's transformed output to stay assignable
 * to its input — so the numeric coercion happens in {@link toSessionInput}, not the
 * schema. The `end > start` rule is **also enforced (as a thrown error) in the
 * domain**; the client refine here is a pre-submit convenience with the same
 * `malformed-session-time` code.
 *
 * Field error messages are stable **error codes**, resolved via `t(\`errors.${code}\`)`.
 */
const WEEKDAY_OPTIONS = ['0', '1', '2', '3', '4', '5', '6'] as const;

const timeField = z
  .string()
  .min(1, { message: 'required' })
  .refine(isTimeOfDay, { message: 'invalid-time' });

const optionalRef = z.string().min(1, { message: 'invalid-id' }).nullable().default(null);

export const sessionFormSchema = z
  .object({
    dayOfWeek: z.enum(WEEKDAY_OPTIONS, { message: 'required' }),
    start: timeField,
    end: timeField,
    roomId: z.string().min(1, { message: 'required' }),
    teacherId: optionalRef,
    groupId: optionalRef,
  })
  .refine((value) => value.end > value.start, {
    message: 'malformed-session-time',
    path: ['end'],
  });

/** Pre-parse shape RHF holds (weekday as a string), vs the parsed {@link SessionFormValues}. */
export type SessionFormInput = z.input<typeof sessionFormSchema>;

/** The validated form values (weekday still a string — see {@link toSessionInput}). */
export type SessionFormValues = z.output<typeof sessionFormSchema>;

/**
 * The RHF `Control` for this form. Spells out all three type args (input, context,
 * transformed output) so the child field components accept the resolver's control.
 */
export type SessionFormControl = Control<SessionFormInput, unknown, SessionFormValues>;

/**
 * The weekly-session write payload — bound by shape to the domain's
 * `WeeklyRecurringSessionInput`. `active` / `validFrom` / `validTo` are omitted so
 * the use case applies its defaults (`active = true`, null window). At integration
 * this alias is replaced by the imported `WeeklyRecurringSessionInput`.
 */
export type SessionInput = {
  readonly roomId: string;
  readonly teacherId: string | null;
  readonly groupId: string | null;
  readonly dayOfWeek: number;
  readonly start: string;
  readonly end: string;
};

/** Bridges the validated form values to the numeric-weekday contract payload. */
export function toSessionInput(values: SessionFormValues): SessionInput {
  return {
    roomId: values.roomId,
    teacherId: values.teacherId,
    groupId: values.groupId,
    dayOfWeek: Number(values.dayOfWeek),
    start: values.start,
    end: values.end,
  };
}

/** Blank create defaults: Monday pre-selected, no time/room/teacher/group. */
export const EMPTY_SESSION_INPUT: SessionFormInput = {
  dayOfWeek: '1',
  start: '',
  end: '',
  roomId: '',
  teacherId: null,
  groupId: null,
};
