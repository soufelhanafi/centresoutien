import { describe, it, expect, beforeEach } from 'vitest';
import { CreateAdminAccount } from '../../../src/use-cases/create-admin-account';
import { VerifyUserPassword } from '../../../src/use-cases/verify-user-password';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { seedPendingInvite } from '../fakes/pending-invite';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const PASSWORD = ['Casa', '2026', '!'].join('');
const CONTEXT = {
  centerCode: 'CS-CASA-001' as CenterCode,
  deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
};

describe('VerifyUserPassword', () => {
  let users: InMemoryUserRepository;
  let verify: VerifyUserPassword;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    const hasher = fakeHasher();
    const clock = fakeClock('2026-07-29T10:00:00Z');
    await new CreateAdminAccount(users, hasher, clock, fakeIds(), CONTEXT).execute({
      username: 'directrice',
      password: PASSWORD,
    });
    verify = new VerifyUserPassword(users, hasher);
  });

  it('returns the identity on a correct password', async () => {
    const identity = await verify.execute({ username: 'directrice', password: PASSWORD });
    expect(identity).toMatchObject({ username: 'directrice', role: 'owner' });
  });

  it('matches regardless of username casing (SOU-153)', async () => {
    const identity = await verify.execute({ username: 'DIRECTRICE', password: PASSWORD });
    expect(identity).not.toBeNull();
  });

  it('returns null on a wrong password', async () => {
    expect(await verify.execute({ username: 'directrice', password: 'Wrong2026!' })).toBeNull();
  });

  it('returns null on an unknown username', async () => {
    expect(await verify.execute({ username: 'ghost', password: PASSWORD })).toBeNull();
  });

  it('returns null for a pending invite that has no password set', async () => {
    const invite = await seedPendingInvite(
      users,
      fakeClock('2026-07-29T10:00:00Z'),
      { ...CONTEXT, updatedBy: 'usr_00000000000000000000000001' as UserId },
      'A7K2-9FMP-3QRT',
      fakeIds(9),
    );
    expect(await verify.execute({ username: invite.username, password: PASSWORD })).toBeNull();
  });
});
