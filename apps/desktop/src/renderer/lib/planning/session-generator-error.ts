import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors the auto-session-generator channels raise, as the renderer must
 * handle them (SOU-158/159/161). The domain throws these; the renderer decodes
 * the stable code from the IPC rejection (see `resolveDomainErrorCode`) and
 * localizes a fixed line via `t(\`errors.${code}\`)`.
 *
 * - `infeasible-generator-config` / `no-rooms-configured` are raised by the
 *   **preview** (the pure engine can't place the requested pattern, or the center
 *   has no rooms to assign) — surfaced inline on the config step so the admin can
 *   fix the config before ever committing.
 * - The scheduling clashes (`room-conflict`, `session-outside-center-hours`,
 *   `weekly-recurring-session-not-found`) are raised by the **commit** step, which
 *   re-runs the composite conflict check against the live schedule at write time.
 */
export type GeneratorErrorCode =
  | 'infeasible-generator-config'
  | 'no-rooms-configured'
  | 'room-conflict'
  | 'session-outside-center-hours'
  | 'weekly-recurring-session-not-found';

const DECODED_CODE_TO_RENDERER_CODE: Readonly<Record<string, GeneratorErrorCode>> = {
  'infeasible-generator-config': 'infeasible-generator-config',
  'no-rooms-configured': 'no-rooms-configured',
  RoomConflictError: 'room-conflict',
  SessionOutsideCenterHoursError: 'session-outside-center-hours',
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
