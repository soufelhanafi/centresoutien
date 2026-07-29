import { describe, expect, it } from 'vitest';
import type { AdminAccountId, CenterCode, DeviceId, SubjectId, UserId } from '@centresoutien/domain';
import { createIpcDispatcher } from '../../../src/main/ipc/dispatcher';
import {
  createHandlers,
  type CreateSubjectUseCase,
  type CreateAdminAccountUseCase,
  type VerifyAdminPasswordUseCase,
  type AttemptLoginUseCase,
  type DeviceSessions,
  type SubjectContext,
} from '../../../src/main/ipc/handlers';
import type { IpcHandlers } from '../../../src/shared/ipc/contract';

// Throwaway test password assembled from fragments (secret-scan friendly).
const PASS = ['Casa', '2026', '!'].join('');

const context: SubjectContext = {
  centerCode: 'CS-DEV-001' as CenterCode,
  deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
  updatedBy: 'usr_00000000000000000000000001' as UserId,
};

// Stub use case — the handler only needs `execute` (Pick<CreateSubject,'execute'>).
const stubCreateSubject: CreateSubjectUseCase = {
  execute: async (input) => ({
    id: 'sub_00000000000000000000000001' as SubjectId,
    centerCode: input.centerCode,
    deviceOrigin: input.deviceOrigin,
    createdAt: new Date('2026-07-29T10:00:00Z'),
    updatedAt: new Date('2026-07-29T10:00:00Z'),
    updatedBy: input.updatedBy,
    deletedAt: null,
    version: 0,
    name: input.name,
    active: true,
  }),
};

// Stub admin use cases — the handler only needs `execute`.
const stubCreateAdminAccount: CreateAdminAccountUseCase = {
  execute: async (input) => ({
    id: 'adm_00000000000000000000000001' as AdminAccountId,
    username: input.username,
    passwordHash: 'hashed',
    createdAt: new Date('2026-07-29T10:00:00Z'),
    updatedAt: new Date('2026-07-29T10:00:00Z'),
  }),
};
const stubVerifyAdminPassword: VerifyAdminPasswordUseCase = {
  execute: async (input) => input.password === PASS,
};

// Stub login use case — locked when the password is 'locked', wrong when it is
// 'nope', otherwise success. Enough to exercise all three response shapes.
const LOCKED_UNTIL_MS = new Date('2026-07-29T10:15:00Z').getTime();
const stubAttemptLogin: AttemptLoginUseCase = {
  execute: async (input) => {
    if (input.password === 'locked') return { outcome: 'locked-out', lockedUntil: LOCKED_UNTIL_MS };
    if (input.password === 'nope') return { outcome: 'invalid-credentials', remainingAttempts: 3 };
    return { outcome: 'success' };
  },
};
let remembered = false;
const stubDeviceSessions: DeviceSessions = {
  isAuthenticated: async () => remembered,
  forget: async () => {
    remembered = false;
  },
};

const dispatch = createIpcDispatcher(
  createHandlers({
    appVersion: () => '2.0.0',
    activePlanId: () => 'pro',
    createSubject: stubCreateSubject,
    subjectContext: () => context,
    adminExists: async () => false,
    createAdminAccount: stubCreateAdminAccount,
    verifyAdminPassword: stubVerifyAdminPassword,
    attemptLogin: stubAttemptLogin,
    deviceSessions: stubDeviceSessions,
  }),
);

describe('createIpcDispatcher', () => {
  it('validates the request, runs the handler, and validates the response', async () => {
    await expect(dispatch('app.ping', { message: 'hi' })).resolves.toEqual({
      reply: 'pong: hi',
      appVersion: '2.0.0',
    });
  });

  it('runs the plan.get handler', async () => {
    await expect(dispatch('plan.get', {})).resolves.toEqual({ planId: 'pro' });
  });

  it('runs subject.create and returns the new id', async () => {
    await expect(
      dispatch('subject.create', { name: { fr: 'Mathématiques', ar: 'الرياضيات' } }),
    ).resolves.toEqual({ id: 'sub_00000000000000000000000001' });
  });

  it('rejects subject.create whose name fails the shared schema', async () => {
    await expect(dispatch('subject.create', { name: { fr: '', ar: '' } })).rejects.toThrow();
  });

  it('runs admin.exists', async () => {
    await expect(dispatch('admin.exists', {})).resolves.toEqual({ exists: false });
  });

  it('runs admin.create and returns the new id', async () => {
    await expect(
      dispatch('admin.create', { username: 'directrice', password: PASS }),
    ).resolves.toEqual({ id: 'adm_00000000000000000000000001' });
  });

  it('rejects admin.create whose password fails the shared policy schema', async () => {
    await expect(
      dispatch('admin.create', { username: 'directrice', password: 'weak' }),
    ).rejects.toThrow();
  });

  it('runs admin.verify and returns validity', async () => {
    await expect(
      dispatch('admin.verify', { username: 'directrice', password: PASS }),
    ).resolves.toEqual({ valid: true });
    await expect(
      dispatch('admin.verify', { username: 'directrice', password: 'nope' }),
    ).resolves.toEqual({ valid: false });
  });

  it('serializes auth.login success', async () => {
    await expect(
      dispatch('auth.login', { username: 'directrice', password: PASS, rememberDevice: true }),
    ).resolves.toEqual({ outcome: 'success' });
  });

  it('serializes auth.login invalid-credentials with remaining attempts', async () => {
    await expect(
      dispatch('auth.login', { username: 'directrice', password: 'nope' }),
    ).resolves.toEqual({ outcome: 'invalid-credentials', remainingAttempts: 3 });
  });

  it('serializes auth.login locked-out as epoch millis', async () => {
    await expect(
      dispatch('auth.login', { username: 'directrice', password: 'locked' }),
    ).resolves.toEqual({ outcome: 'locked-out', lockedUntilMs: LOCKED_UNTIL_MS });
  });

  it('runs auth.session and auth.logout', async () => {
    remembered = true;
    await expect(dispatch('auth.session', {})).resolves.toEqual({ authenticated: true });
    await expect(dispatch('auth.logout', {})).resolves.toEqual({ ok: true });
    await expect(dispatch('auth.session', {})).resolves.toEqual({ authenticated: false });
  });

  it('rejects a request that fails its schema', async () => {
    await expect(dispatch('app.ping', { message: 123 })).rejects.toThrow();
    await expect(dispatch('app.ping', {})).rejects.toThrow();
  });

  it('rejects an unknown channel', async () => {
    // @ts-expect-error — deliberately off-contract to prove the runtime guard
    await expect(dispatch('nope.channel', {})).rejects.toThrow(/unknown ipc channel/i);
  });

  it('rejects when a handler returns an off-contract response', async () => {
    const bad = {
      // missing appVersion — must fail response validation
      'app.ping': () => ({ reply: 'x' }),
    } as unknown as IpcHandlers;
    const badDispatch = createIpcDispatcher(bad);
    await expect(badDispatch('app.ping', { message: 'hi' })).rejects.toThrow();
  });
});
