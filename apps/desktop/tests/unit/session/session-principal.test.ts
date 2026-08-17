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
    passwordHash: '$argon2id$hash',
    setupCodeHash: null,
    setupCodeExpiresAt: null,
    setupCodeRedeemedAt: new Date('2026-08-01T00:00:00Z'),
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
    expect(principal).toEqual({ userId: OWNER, role: 'owner' });
    // The synchronous snapshot the envelope reads mirrors the last resolve.
    expect(service.current()).toEqual({ userId: OWNER, role: 'owner' });
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
    expect(await service.resolve()).toEqual({ userId: OWNER, role: 'secretary' });
    role = 'admin';
    expect(await service.resolve()).toEqual({ userId: OWNER, role: 'admin' });
  });

  it('clear() drops the cached principal (logout)', async () => {
    const service = new SessionPrincipalService(makeSessions(OWNER), makeUsers(makeUser(OWNER, 'owner')));
    await service.resolve();
    service.clear();
    expect(service.current()).toBeNull();
  });
});
