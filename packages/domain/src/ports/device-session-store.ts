import type { DeviceSession } from '../entities/device-session';

/**
 * Persistence port for the remembered device session (SOU-27). A single active
 * session at a time: `save` replaces any current one, `clear` removes it. The
 * store is dumb — it never decides expiry; the domain does that with the `Clock`.
 * Device-local infra: no soft-delete, no sync surface.
 */
export interface DeviceSessionStore {
  save(session: DeviceSession): Promise<void>;
  /** The current session, or `null` when the device is not remembered. */
  getCurrent(): Promise<DeviceSession | null>;
  clear(): Promise<void>;
}
