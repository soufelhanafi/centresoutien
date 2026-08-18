import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors the auto-session-generator channels raise, as the renderer must
 * handle them (SOU-158/159/161). The domain throws these; the renderer decodes
 * the stable code from the IPC rejection (see `resolveDomainErrorCode`) and
 * localizes a fixed line via `t(\`errors.${code}\`)`.
 *
 * - `infeasible-generator-config` / `no-rooms-configured` /
 *   `group-exceeds-room-capacity` are raised by the **preview** (the pure engine
 *   can't place the requested pattern, the center has no rooms to assign, or a
 *   group is larger than every room) — surfaced inline on the config step so the
 *   admin can fix the config before ever committing.
 * - The scheduling clashes (`room-conflict`, `session-outside-center-hours`,
 *   `weekly-recurring-session-not-found`) and `schedule-capacity-conflict` are
 *   raised by the **commit** step, which re-runs the composite conflict check
 *   against the live schedule at write time. `schedule-capacity-conflict` (SOU-275)
 *   is the seat-overflow pre-flight refusing the whole batch when a room shrank or
 *   a group grew between preview and commit — the preview gating normally prevents
 *   it, so it only surfaces on that race.
 * - `group-over-capacity` is the per-block seat-fit invariant inside
 *   `CreateWeeklyRecurringSession`, the defense-in-depth backstop to the pre-flight
 *   above. It only fires if the room shrank or group grew *between* the batch
 *   pre-flight and a later block's write; mapping it here degrades that race to the
 *   same actionable seat-overflow message instead of a generic toast (SOU-275).
 */
export type GeneratorErrorCode =
  | 'infeasible-generator-config'
  | 'no-rooms-configured'
  | 'group-exceeds-room-capacity'
  | 'room-conflict'
  | 'session-outside-center-hours'
  | 'schedule-capacity-conflict'
  | 'group-over-capacity'
  | 'weekly-recurring-session-not-found';

const DECODED_CODE_TO_RENDERER_CODE: Readonly<Record<string, GeneratorErrorCode>> = {
  'infeasible-generator-config': 'infeasible-generator-config',
  'no-rooms-configured': 'no-rooms-configured',
  'group-exceeds-room-capacity': 'group-exceeds-room-capacity',
  RoomConflictError: 'room-conflict',
  SessionOutsideCenterHoursError: 'session-outside-center-hours',
  'schedule-capacity-conflict': 'schedule-capacity-conflict',
  'group-over-capacity': 'group-over-capacity',
  'weekly-recurring-session-not-found': 'weekly-recurring-session-not-found',
};

/**
 * Narrows a caught generator preview/commit rejection to a {@link GeneratorErrorCode}
 * so the popup can surface it inline, or `null` for an unrelated failure the
 * caller should toast generically.
 */
export function mapGeneratorError(error: unknown): GeneratorErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null ? (DECODED_CODE_TO_RENDERER_CODE[code] ?? null) : null;
}
