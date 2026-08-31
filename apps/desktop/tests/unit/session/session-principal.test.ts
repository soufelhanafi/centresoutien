import { describe, it, expect } from 'vitest';
import type { Role, User, UserId } from '@centresoutien/domain';
import {
  SessionPrincipalService,
  type ActiveSessionReader,
  type UserByIdReader,
} from '../../../src/main/session/session-principal';

const OWNER = 'usr_00000000000000000000000001' as UserId;

function makeUser(id: UserId, role: Role): User {
  return {
    id,
    centerCode: 'CS-CASA-001' as User['centerCode'],
    deviceOrigin: 'dev_00000000000000000000000001' as User['deviceOrigin'],
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    updatedBy: id,
    deletedAt: null,
    version: 0,
    role,
    username: 'directrice',
    fullName: null,
    passwordHash: '$argon2id$hash',
    setupCodeHash: null,
    setupCodeExpiresAt: null,
    setupCodeRedeemedAt: new Date('2026-08-01T00:00:00Z'),
    email: null,
    permissions: new Set(),
  };
}

function makeSessions(userId: UserId | null): ActiveSessionReader {
  return { activeUserId: async () => userId };
}

function makeUsers(user: User | null): UserByIdReader {
  return { findById: async () => user };
}

describe('SessionPrincipalService', () => {
  it('resolves { userId, role } from the active session and the user row', async () => {
    const service = new SessionPrincipalService(makeSessions(OWNER), makeUsers(makeUser(OWNER, 'owner')));
    const principal = await service.resolve();
    expect(principal).toEqual({ userId: OWNER, role: 'owner', permissions: new Set() });
    // The synchronous snapshot the envelope reads mirrors the last resolve.
    expect(service.current()).toEqual({ userId: OWNER, role: 'owner', permissions: new Set() });
  });

  it('resolves null when the device has no active session (unknown principal)', async () => {
    const service = new SessionPrincipalService(makeSessions(null), makeUsers(makeUser(OWNER, 'owner')));
    expect(await service.resolve()).toBeNull();
    expect(service.current()).toBeNull();
  });

  it('resolves null when the session points at a since-removed user', async () => {
    const service = new SessionPrincipalService(makeSessions(OWNER), makeUsers(null));
    expect(await service.resolve()).toBeNull();
    expect(service.current()).toBeNull();
  });

  it('current() is null before the first resolve (bootstrap fallback territory)', () => {
    const service = new SessionPrincipalService(makeSessions(OWNER), makeUsers(makeUser(OWNER, 'owner')));
    expect(service.current()).toBeNull();
  });

  it('reflects the CURRENT role on each resolve — a role change takes effect immediately', async () => {
    let role: Role = 'secretary';
    const service = new SessionPrincipalService(makeSessions(OWNER), {
      findById: async () => makeUser(OWNER, role),
    });
    expect(await service.resolve()).toEqual({ userId: OWNER, role: 'secretary', permissions: new Set() });
    role = 'admin';
    expect(await service.resolve()).toEqual({ userId: OWNER, role: 'admin', permissions: new Set() });
  });

  it('clear() drops the cached principal (logout)', async () => {
    const service = new SessionPrincipalService(makeSessions(OWNER), makeUsers(makeUser(OWNER, 'owner')));
    await service.resolve();
    service.clear();
    expect(service.current()).toBeNull();
  });

  it('set() establishes the principal directly from a verified login, no session read (B1)', () => {
    // The session reader returns null (a non-remembered login persists nothing);
    // set() must still establish the principal from the verified identity.
    const service = new SessionPrincipalService(makeSessions(null), makeUsers(null));
    service.set({ userId: OWNER, role: 'admin', permissions: new Set() });
    expect(service.current()).toEqual({ userId: OWNER, role: 'admin', permissions: new Set() });
  });

  it('the guard resolve() keeps a non-remembered login on an empty session read (SOU-303)', async () => {
    // A director logs in WITHOUT remember-me: no session row is persisted, so
    // activeUserId() is null. The role guard runs resolve() on the next
    // director-only IPC; it must return the login principal, not downgrade it to
    // null (which failed user.list / user.reissueSetupCode after a re-login).
    const service = new SessionPrincipalService(makeSessions(null), makeUsers(null));
    service.set({ userId: OWNER, role: 'owner', permissions: new Set() });
    expect(await service.resolve()).toEqual({ userId: OWNER, role: 'owner', permissions: new Set() });
    expect(service.current()).toEqual({ userId: OWNER, role: 'owner', permissions: new Set() });
  });

  it('a remembered session still refreshes over a stale login principal, and logout wins', async () => {
    // set() puts a secretary in memory; a remembered session that resolves to an
    // owner row supersedes it (fresh role), proving the empty-read guard does not
    // freeze a genuinely resolvable session.
    let sessionUserId: UserId | null = OWNER;
    const service = new SessionPrincipalService(
      { activeUserId: async () => sessionUserId },
      makeUsers(makeUser(OWNER, 'owner')),
    );
    service.set({ userId: OWNER, role: 'secretary', permissions: new Set() });
    expect(await service.resolve()).toEqual({ userId: OWNER, role: 'owner', permissions: new Set() });
    // After logout both the in-memory login and the session are gone — the empty
    // read is authoritative again, with no lingering login principal to keep.
    service.clear();
    sessionUserId = null;
    expect(await service.resolve()).toBeNull();
    expect(service.current()).toBeNull();
  });

  it('discards an in-flight resolve superseded by clear() — logout cannot be resurrected (B3)', async () => {
    let release!: (id: UserId | null) => void;
    const gate = new Promise<UserId | null>((resolve) => {
      release = resolve;
    });
    const service = new SessionPrincipalService(
      { activeUserId: () => gate },
      makeUsers(makeUser(OWNER, 'owner')),
    );
    const inFlight = service.resolve();
    // Logout lands while the session read is still pending.
    service.clear();
    // The now-stale read completes afterwards; it must NOT restore the principal.
    release(OWNER);
    expect(await inFlight).toBeNull();
    expect(service.current()).toBeNull();
  });

  it('a login (set) during an in-flight resolve is not clobbered by the stale resolve (B3)', async () => {
    let release!: (id: UserId | null) => void;
    const gate = new Promise<UserId | null>((resolve) => {
      release = resolve;
    });
    const service = new SessionPrincipalService(
      { activeUserId: () => gate },
      makeUsers(makeUser(OWNER, 'secretary')),
    );
    const inFlight = service.resolve();
    service.set({ userId: OWNER, role: 'owner', permissions: new Set() });
    release(OWNER);
    await inFlight;
    // The freshly-established login wins over the stale resolve's secretary read.
    expect(service.current()).toEqual({ userId: OWNER, role: 'owner', permissions: new Set() });
  });

  it('fails closed on a transient read error — a stale principal is not retained (B5)', async () => {
    const users: UserByIdReader = {
      findById: async () => {
        throw new Error('sqlite busy');
      },
    };
    const service = new SessionPrincipalService(makeSessions(OWNER), users);
    // A principal is established, then a transient DB error hits the next resolve.
    service.set({ userId: OWNER, role: 'owner', permissions: new Set() });
    await expect(service.resolve()).rejects.toThrow('sqlite busy');
    // The now-unverifiable principal must be dropped, not silently trusted.
    expect(service.current()).toBeNull();
  });
});
