import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceSessionService } from '../../../src/services/device-session-service';
import {
  DEVICE_SESSION_TTL_MS,
  type DeviceSession,
  type DeviceSessionId,
} from '../../../src/entities/device-session';
import type { UserId } from '../../../src/value-objects/ids';
import { InMemoryDeviceSessionStore } from '../fakes/in-memory-device-session-store';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const USER = 'usr_00000000000000000000000001' as UserId;

describe('DeviceSessionService', () => {
  let store: InMemoryDeviceSessionStore;

  beforeEach(() => {
    store = new InMemoryDeviceSessionStore();
  });

  it('mints a session that expires one TTL from now and stamps the user', async () => {
    const clock = fakeClock('2026-07-28T10:00:00Z');
    const service = new DeviceSessionService(store, clock, fakeIds());

    const session = await service.remember(USER);

    expect(session.id).toMatch(/^ses_/);
    expect(session.createdAt).toBe(clock.now().getTime());
    expect(session.expiresAt).toBe(clock.now().getTime() + DEVICE_SESSION_TTL_MS);
    expect(session.userId).toBe(USER);
    expect(await store.getCurrent()).not.toBeNull();
  });

  it('reports authenticated while the session is live', async () => {
    const clock = fakeClock();
    const service = new DeviceSessionService(store, clock, fakeIds());
    await service.remember(USER);

    expect(await service.isAuthenticated()).toBe(true);
  });

  it('reports not authenticated when there is no session', async () => {
    const service = new DeviceSessionService(store, fakeClock(), fakeIds());
    expect(await service.isAuthenticated()).toBe(false);
  });

  it('clears an expired session and reports not authenticated', async () => {
    const clock = fakeClock('2026-07-28T10:00:00Z');
    const service = new DeviceSessionService(store, clock, fakeIds());
    await service.remember(USER);

    clock.advance(DEVICE_SESSION_TTL_MS + 1);

    expect(await service.isAuthenticated()).toBe(false);
    expect(await store.getCurrent()).toBeNull();
  });

  it('forget removes the remembered session', async () => {
    const service = new DeviceSessionService(store, fakeClock(), fakeIds());
    await service.remember(USER);

    await service.forget();

    expect(await store.getCurrent()).toBeNull();
    expect(await service.isAuthenticated()).toBe(false);
  });

  describe('activeUserId (the session principal seam, SOU-265)', () => {
    it('returns the live session user id', async () => {
      const service = new DeviceSessionService(store, fakeClock(), fakeIds());
      await service.remember(USER);
      expect(await service.activeUserId()).toBe(USER);
    });

    it('returns null when there is no remembered session', async () => {
      const service = new DeviceSessionService(store, fakeClock(), fakeIds());
      expect(await service.activeUserId()).toBeNull();
    });

    it('clears an expired session and returns null', async () => {
      const clock = fakeClock('2026-07-28T10:00:00Z');
      const service = new DeviceSessionService(store, clock, fakeIds());
      await service.remember(USER);

      clock.advance(DEVICE_SESSION_TTL_MS + 1);

      expect(await service.activeUserId()).toBeNull();
      expect(await store.getCurrent()).toBeNull();
    });

    it('returns null for a legacy row with no user id (degrades to unknown principal)', async () => {
      const legacy: DeviceSession = {
        id: 'ses_00000000000000000000000009' as DeviceSessionId,
        createdAt: new Date('2026-07-28T10:00:00Z').getTime(),
        expiresAt: new Date('2026-08-28T10:00:00Z').getTime(),
        userId: null,
      };
      await store.save(legacy);
      const service = new DeviceSessionService(store, fakeClock('2026-07-29T10:00:00Z'), fakeIds());
      expect(await service.activeUserId()).toBeNull();
    });
  });
});
