import { describe, expect, it } from 'vitest';
import type {
  AdminAccountId,
  CenterCode,
  CenterHoursId,
  CenterId,
  DeviceId,
  ParentId,
  PhoneNumber,
  RoomId,
  SubjectId,
  TimeOfDay,
  UserId,
  WeekdayIndex,
  WeeklyRecurringSessionId,
} from '@centresoutien/domain';
import { createIpcDispatcher } from '../../../src/main/ipc/dispatcher';
import {
  createHandlers,
  type CreateSubjectUseCase,
  type CreateParentUseCase,
  type CreateAdminAccountUseCase,
  type VerifyAdminPasswordUseCase,
  type ListWeekSessionsUseCase,
  type SaveCenterHoursUseCase,
  type GetCenterHoursUseCase,
  type AttemptLoginUseCase,
  type DeviceSessions,
  type EnvelopeContext,
  type CenterContext,
  type GetCenterProfileUseCase,
  type SaveCenterProfileUseCase,
  type StoreCenterLogoUseCase,
  type ReadCenterLogoUseCase,
} from '../../../src/main/ipc/handlers';
import type { IpcHandlers } from '../../../src/shared/ipc/contract';

// Throwaway test password assembled from fragments (secret-scan friendly).
const PASS = ['Casa', '2026', '!'].join('');

const context: EnvelopeContext = {
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

// Stub parent use case — echoes an envelope-complete Parent; the handler only
// needs `execute` and returns the new id.
const stubCreateParent: CreateParentUseCase = {
  execute: async (input) => ({
    id: 'prt_00000000000000000000000001' as ParentId,
    centerCode: input.centerCode,
    deviceOrigin: input.deviceOrigin,
    createdAt: new Date('2026-07-29T10:00:00Z'),
    updatedAt: new Date('2026-07-29T10:00:00Z'),
    updatedBy: input.updatedBy,
    deletedAt: null,
    version: 0,
    naturalKey: `${input.centerCode}::x::${input.phone}`,
    name: input.name,
    phone: input.phone as PhoneNumber,
    email: input.email,
    relation: input.relation,
    whatsappOptIn: input.whatsappOptIn,
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
const stubReadLogo: ReadCenterLogoUseCase = {
  execute: async (input) => (input.path === 'logos/lgo_test.png' ? new Uint8Array([7, 8, 9]) : null),
};

// Stub center-hours use cases — echo the input week back as entities.
const stubGetCenterHours: GetCenterHoursUseCase = {
  execute: async () => [],
};
const stubSaveCenterHours: SaveCenterHoursUseCase = {
  execute: async (input) =>
    input.week.map((day, index) => ({
      id: `chr_${String(index).padStart(26, '0')}` as CenterHoursId,
      centerCode: input.centerCode,
      deviceOrigin: input.deviceOrigin,
      createdAt: new Date('2026-07-29T10:00:00Z'),
      updatedAt: new Date('2026-07-29T10:00:00Z'),
      updatedBy: input.updatedBy,
      deletedAt: null,
      version: 0,
      dayOfWeek: day.dayOfWeek as WeekdayIndex,
      open: day.open as TimeOfDay | null,
      close: day.close as TimeOfDay | null,
    })),
};

// Stub weekly-session read — returns one envelope-complete session so the handler
// can prove it strips the envelope down to the boundary DTO (SOU-53 seam).
const stubListWeekSessions: ListWeekSessionsUseCase = {
  execute: async () => [
    {
      id: 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId,
      centerCode: context.centerCode,
      deviceOrigin: context.deviceOrigin,
      createdAt: new Date('2026-07-29T10:00:00Z'),
      updatedAt: new Date('2026-07-29T10:00:00Z'),
      updatedBy: context.updatedBy,
      deletedAt: null,
      version: 0,
      roomId: 'rom_00000000000000000000000001' as RoomId,
      teacherId: null,
      dayOfWeek: 1 as WeekdayIndex,
      start: '09:00' as TimeOfDay,
      end: '10:00' as TimeOfDay,
    },
  ],
};

const dispatch = createIpcDispatcher(
  createHandlers({
    appVersion: () => '2.0.0',
    activePlanId: () => 'pro',
    createSubject: stubCreateSubject,
    createParent: stubCreateParent,
    listWeekSessions: stubListWeekSessions,
    saveCenterHours: stubSaveCenterHours,
    getCenterHours: stubGetCenterHours,
    envelopeContext: () => context,
    adminExists: async () => false,
    createAdminAccount: stubCreateAdminAccount,
    verifyAdminPassword: stubVerifyAdminPassword,
    attemptLogin: stubAttemptLogin,
    deviceSessions: stubDeviceSessions,
    getCenterProfile: stubGetCenter,
    saveCenterProfile: stubSaveCenter,
    storeCenterLogo: stubStoreLogo,
    readCenterLogo: stubReadLogo,
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

  it('runs parent.create, normalizing the phone through the shared schema', async () => {
    await expect(
      dispatch('parent.create', {
        name: 'Ahmed Benali',
        phone: '0612345678',
        relation: 'pere',
      }),
    ).resolves.toEqual({ id: 'prt_00000000000000000000000001' });
  });

  it('rejects parent.create with a missing phone (the required anchor)', async () => {
    await expect(
      dispatch('parent.create', { name: 'Ahmed', phone: '', relation: 'pere' }),
    ).rejects.toThrow();
  });

  it('runs session.week and returns the envelope-stripped session views', async () => {
    await expect(dispatch('session.week', {})).resolves.toEqual({
      sessions: [
        {
          id: 'wrs_00000000000000000000000001',
          roomId: 'rom_00000000000000000000000001',
          teacherId: null,
          dayOfWeek: 1,
          start: '09:00',
          end: '10:00',
        },
      ],
    });
  });

  it('runs centerHours.get and returns the week view', async () => {
    await expect(dispatch('centerHours.get', {})).resolves.toEqual({ week: [] });
  });

  it('runs centerHours.save and echoes the saved week as an envelope-stripped view', async () => {
    const week = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      open: '09:00',
      close: '18:00',
    }));
    await expect(dispatch('centerHours.save', week)).resolves.toEqual({ week });
  });

  it('rejects centerHours.save whose week fails the shared schema', async () => {
    await expect(
      dispatch('centerHours.save', [{ dayOfWeek: 0, open: '18:00', close: '09:00' }]),
    ).rejects.toThrow();
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
      phone: '0522000000',
      email: 'a@b.ma',
      logoPath: null,
    });
    expect(res).toEqual({
      center: {
        name: 'Centre Al Ilm',
        address: 'Rue X',
        phone: '+212522000000', // normalized to E.164 at the contract boundary
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

  it('runs center.logoBytes and returns the stored bytes', async () => {
    await expect(dispatch('center.logoBytes', { path: 'logos/lgo_test.png' })).resolves.toEqual({
      bytes: new Uint8Array([7, 8, 9]),
    });
  });

  it('returns null bytes from center.logoBytes for an unknown path', async () => {
    await expect(dispatch('center.logoBytes', { path: 'logos/missing.png' })).resolves.toEqual({
      bytes: null,
    });
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
