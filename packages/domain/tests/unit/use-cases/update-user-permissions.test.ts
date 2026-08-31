import { describe, it, expect, beforeEach } from 'vitest';
import { CreateUser } from '../../../src/use-cases/create-user';
import { CreateAdminAccount } from '../../../src/use-cases/create-admin-account';
import { UpdateUserPermissions } from '../../../src/use-cases/update-user-permissions';
import { UserNotFoundError, CannotRestrictOwnerError } from '../../../src/errors/user-errors';
import { PERMISSION_FLAGS } from '../../../src/permissions/permissions';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const NOW = '2026-07-29T10:00:00Z';
const DIRECTOR = 'usr_00000000000000000000000009' as UserId;
const CONTEXT = {
  centerCode: 'CS-CASA-001' as CenterCode,
  deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
  updatedBy: DIRECTOR,
};

async function secretary(users: InMemoryUserRepository, clock: ReturnType<typeof fakeClock>) {
  const { user } = await new CreateUser(users, fakeHasher(), clock, fakeIds()).execute({
    role: 'secretary',
    username: 'assistante',
    password: ['Rabat', '2027', '?'].join(''),
    ...CONTEXT,
  });
  return user;
}

describe('UpdateUserPermissions', () => {
  let users: InMemoryUserRepository;
  let clock: ReturnType<typeof fakeClock>;
  let useCase: UpdateUserPermissions;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    clock = fakeClock(NOW);
    useCase = new UpdateUserPermissions(users, clock);
  });

  it('replaces the whole permission set and re-stamps the envelope', async () => {
    const before = await secretary(users, clock);
    clock.advance(60_000);

    const updated = await useCase.execute({
      userId: before.id,
      permissions: new Set(['nav.payroll']),
      updatedBy: DIRECTOR,
    });

    expect(updated.permissions.has('nav.payroll')).toBe(true);
    expect(updated.permissions.has('nav.payments')).toBe(false);
    expect(updated.permissions.has('settings.sensitive')).toBe(false);
    expect(updated.updatedBy).toBe(DIRECTOR);
    expect(updated.updatedAt).toEqual(clock.now());

    const persisted = await users.findById(before.id);
    expect(persisted?.permissions.has('nav.payroll')).toBe(true);
  });

  it('can grant every flag back', async () => {
    const before = await secretary(users, clock);
    const updated = await useCase.execute({
      userId: before.id,
      permissions: new Set(PERMISSION_FLAGS),
      updatedBy: DIRECTOR,
    });
    for (const flag of PERMISSION_FLAGS) {
      expect(updated.permissions.has(flag)).toBe(true);
    }
  });

  it('rejects an unknown user id', async () => {
    await expect(
      useCase.execute({
        userId: 'usr_doesnotexist00000000000001' as UserId,
        permissions: new Set(),
        updatedBy: DIRECTOR,
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('rejects restricting the owner', async () => {
    const owner = await new CreateAdminAccount(users, fakeHasher(), clock, fakeIds(), {
      centerCode: CONTEXT.centerCode,
      deviceOrigin: CONTEXT.deviceOrigin,
    }).execute({ username: 'directrice', password: ['Rabat', '2027', '?'].join('') });

    await expect(
      useCase.execute({ userId: owner.id, permissions: new Set(), updatedBy: DIRECTOR }),
    ).rejects.toBeInstanceOf(CannotRestrictOwnerError);
  });
});
