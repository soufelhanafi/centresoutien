import type { Brand } from '../value-objects/brand';

/** ULID id prefix for a remembered device session: `ses_01HW…`. */
export const DEVICE_SESSION_ID_PREFIX = 'ses';

export type DeviceSessionId = Brand<string, 'DeviceSessionId'>;

/**
 * A remembered login on this machine (SOU-27, "remember this device"). Written
 * only when the admin ticks the toggle, it lets the app skip the login screen on
 * reopen until it expires.
 *
 * Like {@link AdminAccount} this is **device-local infra**: it never syncs, so it
 * carries no envelope and no `naturalKey`. It is not a bearer token presented
 * across a trust boundary — the renderer never sees it; the main process merely
 * checks whether a live session row exists. It lives in the encrypted per-center
 * DB, single active row at a time.
 */
export type DeviceSession = {
  readonly id: DeviceSessionId;
  readonly createdAt: Date;
  readonly expiresAt: Date;
};

/** How long a remembered device stays authenticated: 30 days. */
export const DEVICE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** True while the session has not yet reached its `expiresAt` instant. */
export function isSessionActive(session: DeviceSession, now: Date): boolean {
  return session.expiresAt.getTime() > now.getTime();
}
