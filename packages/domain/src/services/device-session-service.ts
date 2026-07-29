import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { DeviceSessionStore } from '../ports/device-session-store';
import {
  DEVICE_SESSION_ID_PREFIX,
  DEVICE_SESSION_TTL_MS,
  isSessionActive,
  type DeviceSession,
  type DeviceSessionId,
} from '../entities/device-session';

/**
 * Owns the lifecycle of the remembered device session (SOU-27): mint it on a
 * "remember me" login, forget it on logout or a non-remembered login, and report
 * whether the device is still authenticated on reopen. A single collaborator so
 * the login use case and the startup/logout IPC handlers share one implementation
 * instead of re-deriving the TTL rule in three places.
 */
export class DeviceSessionService {
  constructor(
    private readonly sessions: DeviceSessionStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** Persist a fresh session for this device and return it. */
  async remember(): Promise<DeviceSession> {
    const now = this.clock.now();
    const session: DeviceSession = {
      id: this.ids.next(DEVICE_SESSION_ID_PREFIX) as DeviceSessionId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + DEVICE_SESSION_TTL_MS),
    };
    await this.sessions.save(session);
    return session;
  }

  /** Drop any remembered session (logout, or a login that opted out). */
  async forget(): Promise<void> {
    await this.sessions.clear();
  }

  /**
   * Whether the device is still authenticated on reopen. An expired session is
   * cleared as a side effect so stale rows never accumulate.
   */
  async isAuthenticated(): Promise<boolean> {
    const session = await this.sessions.getCurrent();
    if (session === null) return false;
    if (isSessionActive(session, this.clock.now())) return true;
    await this.sessions.clear();
    return false;
  }
}
