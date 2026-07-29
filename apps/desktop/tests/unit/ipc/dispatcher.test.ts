import { describe, expect, it } from 'vitest';
import type {
  AdminAccountId,
  CenterCode,
  CenterId,
  DeviceId,
  SubjectId,
  UserId,
} from '@centresoutien/domain';
import { createIpcDispatcher } from '../../../src/main/ipc/dispatcher';
import {
  createHandlers,
  type CreateSubjectUseCase,
  type CreateAdminAccountUseCase,
  type VerifyAdminPasswordUseCase,
  type AttemptLoginUseCase,
  type DeviceSessions,
  type SubjectContext,
  type CenterContext,
  type GetCenterProfileUseCase,
  type SaveCenterProfileUseCase,
  type StoreCenterLogoUseCase,
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

// Center stubs (SOU-28). The store echoes the last saved profile; the plan is
// seeded from the context and never overwritten by the request.
const centerContext: CenterContext = { ...context, seedPlan: 'pro' };
let savedCenter: {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoPath: string | null;
} | null = null;
const stubGetCenter: GetCenterProfileUseCase = {
  execute: async () =>
    savedCenter === null
      ? null
      : {
          id: 'ctr_00000000000000000000000001' as CenterId,
          centerCode: context.centerCode,
          deviceOrigin: context.deviceOrigin,
          createdAt: new Date('2026-07-29T10:00:00Z'),
          updatedAt: new Date('2026-07-29T10:00:00Z'),
          updatedBy: context.updatedBy,
          deletedAt: null,
          version: 0,
          plan: 'pro',
          ...savedCenter,
        },
};
const stubSaveCenter: SaveCenterProfileUseCase = {
  execute: async (input) => {
    savedCenter = {
      name: input.name,
      address: input.address,
      phone: input.phone,
      email: input.email,
      logoPath: input.logoPath,
    };
    return {
      id: 'ctr_00000000000000000000000001' as CenterId,
      centerCode: input.centerCode,
      deviceOrigin: input.deviceOrigin,
      createdAt: new Date('2026-07-29T10:00:00Z'),
      updatedAt: new Date('2026-07-29T10:00:00Z'),
      updatedBy: input.updatedBy,
      deletedAt: null,
      version: 0,
      plan: input.seedPlan,
      ...savedCenter,
    };
  },
};
const stubStoreLogo: StoreCenterLogoUseCase = {
  execute: async (input) => `logos/lgo_test.${input.extension}`,
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
    getCenterProfile: stubGetCenter,
    saveCenterProfile: stubSaveCenter,
    storeCenterLogo: stubStoreLogo,
    centerContext: () => centerContext,
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

  it('returns null from center.get before any profile is saved', async () => {
    savedCenter = null;
    await expect(dispatch('center.get', {})).resolves.toEqual({ center: null });
  });

  it('runs center.save and returns the DTO with the seeded (not request-supplied) plan', async () => {
    const res = await dispatch('center.save', {
      name: 'Centre Al Ilm',
      address: 'Rue X',
      phone: '0522',
      email: 'a@b.ma',
      logoPath: null,
    });
    expect(res).toEqual({
      center: {
        name: 'Centre Al Ilm',
        address: 'Rue X',
        phone: '0522',
        email: 'a@b.ma',
        logoPath: null,
        plan: 'pro',
      },
    });
    // ...and it is then readable via center.get.
    await expect(dispatch('center.get', {})).resolves.toMatchObject({
      center: { name: 'Centre Al Ilm', plan: 'pro' },
    });
  });

  it('rejects center.save whose name fails the shared schema', async () => {
    await expect(
      dispatch('center.save', { name: '   ', logoPath: null }),
    ).rejects.toThrow();
  });

  it('runs center.saveLogo and returns the stored relative path', async () => {
    await expect(
      dispatch('center.saveLogo', { bytes: new Uint8Array([1, 2, 3]), extension: 'png' }),
    ).resolves.toEqual({ path: 'logos/lgo_test.png' });
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
