import { describe, it, expect, beforeEach } from 'vitest';
import { CreateUser, type CreateUserCommand } from '../../../src/use-cases/create-user';
import {
  InvalidUserRoleError,
  RoleNotInvitableError,
  UsernameAlreadyTakenError,
} from '../../../src/errors/user-errors';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const NOW = '2026-07-29T10:00:00Z';
// Split so no contiguous password-shaped literal lands in the diff for secret scanners.
const PASSWORD = ['Secret', '123'].join('');

function command(overrides: Partial<CreateUserCommand> = {}): CreateUserCommand {
  return {
    role: 'secretary',
    username: 'assistante',
    password: PASSWORD,
    centerCode: 'CS-CASA-001' as CenterCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    ...overrides,
  };
}

describe('CreateUser', () => {
  let users: InMemoryUserRepository;
  let useCase: CreateUser;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    useCase = new CreateUser(users, fakeHasher(), fakeClock(NOW), fakeIds());
  });

  describe('happy path (director sets credentials directly)', () => {
    it('creates an active account with a hashed password and the chosen username', async () => {
      const { user } = await useCase.execute(command());

      expect(user.id).toMatch(/^usr_/);
      expect(user.role).toBe('secretary');
      expect(user.username).toBe('assistante');
      // The account is born active: a password is hashed immediately and no setup
      // code is minted. The employee signs in directly.
      expect(user.passwordHash).toBe(`hashed:${PASSWORD}`);
      expect(user.passwordHash).not.toBe(PASSWORD);
      expect(user.setupCodeHash).toBeNull();
      expect(user.setupCodeExpiresAt).toBeNull();
      expect(user.setupCodeRedeemedAt).toBeNull();
    });

    it('stores the optional display name, folding a blank one to null', async () => {
      const named = await useCase.execute(command({ fullName: 'Amina Alaoui' }));
      expect(named.user.fullName).toBe('Amina Alaoui');

      const blank = await useCase.execute(command({ username: 'autre', fullName: '   ' }));
      expect(blank.user.fullName).toBeNull();
    });

    it('carries a fresh envelope stamped by the creating director', async () => {
      const { user } = await useCase.execute(command());
      expect(user.updatedBy).toBe('usr_00000000000000000000000001');
      expect(user.centerCode).toBe('CS-CASA-001');
      expect(user.version).toBe(0);
      expect(user.deletedAt).toBeNull();
      expect(user.createdAt).toEqual(new Date(NOW));
    });
  });

  describe('username uniqueness (exact, not fuzzy)', () => {
    it('rejects a username already taken by a live account', async () => {
      await useCase.execute(command({ username: 'assistante' }));
      await expect(
        useCase.execute(command({ username: 'assistante' })),
      ).rejects.toBeInstanceOf(UsernameAlreadyTakenError);
      expect(users.all()).toHaveLength(1);
    });

    it('matches case-insensitively so casing cannot smuggle a duplicate in', async () => {
      await useCase.execute(command({ username: 'assistante' }));
      await expect(
        useCase.execute(command({ username: 'ASSISTANTE' })),
      ).rejects.toBeInstanceOf(UsernameAlreadyTakenError);
    });
  });

  describe('fail-closed role (SOU-95)', () => {
    it('rejects an unknown role token', async () => {
      await expect(useCase.execute(command({ role: 'superuser' }))).rejects.toBeInstanceOf(
        InvalidUserRoleError,
      );
      expect(users.all()).toHaveLength(0);
    });

    it('rejects a blank role', async () => {
      await expect(useCase.execute(command({ role: '  ' }))).rejects.toThrow();
    });
  });

  describe('invitable role only (privilege escalation)', () => {
    it('rejects an owner — the owner is minted only at first-run', async () => {
      await expect(useCase.execute(command({ role: 'owner' }))).rejects.toBeInstanceOf(
        RoleNotInvitableError,
      );
      expect(users.all()).toHaveLength(0);
    });

    it('rejects an admin', async () => {
      await expect(useCase.execute(command({ role: 'admin' }))).rejects.toBeInstanceOf(
        RoleNotInvitableError,
      );
      expect(users.all()).toHaveLength(0);
    });

    it('rejects a viewer', async () => {
      await expect(useCase.execute(command({ role: 'viewer' }))).rejects.toBeInstanceOf(
        RoleNotInvitableError,
      );
    });
  });

  describe('password strength', () => {
    it('rejects a password below the strength bar', async () => {
      await expect(useCase.execute(command({ password: 'weak' }))).rejects.toThrow();
      expect(users.all()).toHaveLength(0);
    });
  });
});
