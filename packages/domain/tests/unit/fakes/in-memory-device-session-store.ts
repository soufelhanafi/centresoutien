import type { DeviceSessionStore } from '../../../src/ports/device-session-store';
import type { DeviceSession } from '../../../src/entities/device-session';

/**
 * In-memory {@link DeviceSessionStore} for unit tests. A single active session,
 * cloned on read/write. `saveCount` lets tests assert a session was (or was not)
 * persisted without reaching into private state.
 */
export class InMemoryDeviceSessionStore implements DeviceSessionStore {
  private session: DeviceSession | null = null;
  saveCount = 0;
  clearCount = 0;

  async save(session: DeviceSession): Promise<void> {
    this.saveCount += 1;
    this.session = { ...session };
  }

  async getCurrent(): Promise<DeviceSession | null> {
    return this.session ? { ...this.session } : null;
  }

  async clear(): Promise<void> {
    this.clearCount += 1;
    this.session = null;
  }
}
