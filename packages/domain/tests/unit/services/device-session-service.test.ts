import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceSessionService } from '../../../src/services/device-session-service';
import { DEVICE_SESSION_TTL_MS } from '../../../src/entities/device-session';
import { InMemoryDeviceSessionStore } from '../fakes/in-memory-device-session-store';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

describe('DeviceSessionService', () => {
  let store: InMemoryDeviceSessionStore;

  beforeEach(() => {
    store = new InMemoryDeviceSessionStore();
  });

  it('mints a session that expires one TTL from now', async () => {
    const clock = fakeClock('2026-07-28T10:00:00Z');
    const service = new DeviceSessionService(store, clock, fakeIds());

    const session = await service.remember();

    expect(session.id).toMatch(/^ses_/);
    expect(session.createdAt).toBe(clock.now().getTime());
    expect(session.expiresAt).toBe(clock.now().getTime() + DEVICE_SESSION_TTL_MS);
    expect(await store.getCurrent()).not.toBeNull();
  });

  it('reports authenticated while the session is live', async () => {
    const clock = fakeClock();
    const service = new DeviceSessionService(store, clock, fakeIds());
    await service.remember();

    expect(await service.isAuthenticated()).toBe(true);
  });

  it('reports not authenticated when there is no session', async () => {
    const service = new DeviceSessionService(store, fakeClock(), fakeIds());
    expect(await service.isAuthenticated()).toBe(false);
  });

  it('clears an expired session and reports not authenticated', async () => {
    const clock = fakeClock('2026-07-28T10:00:00Z');
    const service = new DeviceSessionService(store, clock, fakeIds());
    await service.remember();

    clock.advance(DEVICE_SESSION_TTL_MS + 1);

    expect(await service.isAuthenticated()).toBe(false);
    expect(await store.getCurrent()).toBeNull();
  });

  it('forget removes the remembered session', async () => {
    const service = new DeviceSessionService(store, fakeClock(), fakeIds());
    await service.remember();

    await service.forget();

    expect(await store.getCurrent()).toBeNull();
    expect(await service.isAuthenticated()).toBe(false);
  });
});
