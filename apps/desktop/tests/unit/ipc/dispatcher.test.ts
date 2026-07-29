import { describe, expect, it } from 'vitest';
import type {
  AdminAccountId,
  CenterCode,
  CenterHoursId,
  DeviceId,
  SubjectId,
  TimeOfDay,
  UserId,
  WeekdayIndex,
} from '@centresoutien/domain';
import { createIpcDispatcher } from '../../../src/main/ipc/dispatcher';
import {
  createHandlers,
  type CreateSubjectUseCase,
  type CreateAdminAccountUseCase,
  type VerifyAdminPasswordUseCase,
  type SaveCenterHoursUseCase,
  type GetCenterHoursUseCase,
  type EnvelopeContext,
} from '../../../src/main/ipc/handlers';
import type { IpcHandlers } from '../../../src/shared/ipc/contract';

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
  execute: async (input) => input.password === 'Casa2026!',
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

const dispatch = createIpcDispatcher(
  createHandlers({
    appVersion: () => '2.0.0',
    activePlanId: () => 'pro',
    createSubject: stubCreateSubject,
    saveCenterHours: stubSaveCenterHours,
    getCenterHours: stubGetCenterHours,
    envelopeContext: () => context,
    adminExists: async () => false,
    createAdminAccount: stubCreateAdminAccount,
    verifyAdminPassword: stubVerifyAdminPassword,
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
      dispatch('admin.create', { username: 'directrice', password: 'Casa2026!' }),
    ).resolves.toEqual({ id: 'adm_00000000000000000000000001' });
  });

  it('rejects admin.create whose password fails the shared policy schema', async () => {
    await expect(
      dispatch('admin.create', { username: 'directrice', password: 'weak' }),
    ).rejects.toThrow();
  });

  it('runs admin.verify and returns validity', async () => {
    await expect(
      dispatch('admin.verify', { username: 'directrice', password: 'Casa2026!' }),
    ).resolves.toEqual({ valid: true });
    await expect(
      dispatch('admin.verify', { username: 'directrice', password: 'nope' }),
    ).resolves.toEqual({ valid: false });
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
