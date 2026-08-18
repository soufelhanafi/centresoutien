import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { DeviceSessionStore } from '../ports/device-session-store';
import type { UserId } from '../value-objects/ids';
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

  /**
   * Persist a fresh session for this device and return it. `userId` is the user
   * that just logged in, stamped on the row so a remember-me reopen can recover
   * the trusted session principal (SOU-265) with no fresh login.
   */
  async remember(userId: UserId): Promise<DeviceSession> {
    const nowMs = this.clock.now().getTime();
    const session: DeviceSession = {
      id: this.ids.next(DEVICE_SESSION_ID_PREFIX) as DeviceSessionId,
      createdAt: nowMs,
      expiresAt: nowMs + DEVICE_SESSION_TTL_MS,
      userId,
    };
    await this.sessions.save(session);
    return session;
  }

  /**
   * Drop any remembered session (logout, or a login that opted out). Returns
   * whether a session actually existed, so a caller can record an invalidation
   * only when one really happened.
   */
  async forget(): Promise<boolean> {
    const session = await this.sessions.getCurrent();
    if (session === null) return false;
    await this.sessions.clear();
    return true;
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

  /**
   * The user id of the LIVE remembered session, or `null` when the device is not
   * remembered, the session has expired (cleared here as a side effect, mirroring
   * {@link isAuthenticated}), or the row predates SOU-265 and carries no `userId`
   * (a legacy session — the caller treats it as an unknown principal). This is the
   * seam the main-process session-principal resolver reads to recover who is
   * signed in after a remember-me reopen.
   */
  async activeUserId(): Promise<UserId | null> {
    const session = await this.sessions.getCurrent();
    if (session === null) return null;
    if (isSessionActive(session, this.clock.now())) return session.userId;
    await this.sessions.clear();
    return null;
  }
}
