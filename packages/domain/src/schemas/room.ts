import { z } from 'zod';

/**
 * Room input schema — the user-editable fields when creating or editing a Room
 * (its plain-string name and its seat capacity). The envelope (ULID, centerCode,
 * timestamps, version…) and `active` are set by the use case, never by the form.
 *
 * `capacity ≥ 1` is the ticket's core invariant and lives here so the single
 * schema enforces it for both the form (via zodResolver) and the use case.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 */

export const ROOM_NAME_MAX = 80;
export const ROOM_CAPACITY_MIN = 1;

export const roomInputSchema = z.object({
  name: z.string().trim().min(1, { message: 'required' }).max(ROOM_NAME_MAX, { message: 'too-long' }),
  capacity: z
    .number()
    .int({ message: 'not-an-integer' })
    .min(ROOM_CAPACITY_MIN, { message: 'capacity-too-small' }),
});

export type RoomInput = z.infer<typeof roomInputSchema>;
