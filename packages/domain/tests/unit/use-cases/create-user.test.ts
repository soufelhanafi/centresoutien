import { describe, it, expect, beforeEach } from 'vitest';
import { CreateUser, type CreateUserCommand } from '../../../src/use-cases/create-user';
import { SETUP_CODE_TTL_MS } from '../../../src/entities/user';
import { InvalidUserRoleError, RoleNotInvitableError } from '../../../src/errors/user-errors';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeSecureRandom } from '../fakes/secure-random';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const NOW = '2026-07-29T10:00:00Z';

function command(overrides: Partial<CreateUserCommand> = {}): CreateUserCommand {
  return {
    role: 'secretary',
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
    useCase = new CreateUser(users, fakeHasher(), fakeSecureRandom(), fakeClock(NOW), fakeIds());
  });

  describe('happy path (code-first — role only, no identity)', () => {
    it('creates a pending invite with a hashed code, no password, and no identity yet', async () => {
      const { user, setupCode } = await useCase.execute(command());

      expect(user.id).toMatch(/^usr_/);
      expect(user.role).toBe('secretary');
      // No username/full name/email is chosen by the director — the staff set them
      // at redemption. Until then the row carries a non-final placeholder username.
      expect(user.username).toBe(user.id);
      expect(user.fullName).toBeNull();
      expect(user.email).toBeNull();
      expect(user.passwordHash).toBeNull();
      expect(setupCode).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
      // Only the hash is stored, never the plaintext code.
      expect(user.setupCodeHash).toBe(`hashed:${setupCode}`);
      expect(user.setupCodeHash).not.toBe(setupCode);
      expect(user.setupCodeRedeemedAt).toBeNull();
    });

    it('gives each invite a distinct placeholder so two open invites never collide', async () => {
      const first = await useCase.execute(command());
      const second = await useCase.execute(command());
      expect(first.user.username).not.toBe(second.user.username);
      expect(users.all()).toHaveLength(2);
    });

    it('sets the setup code to expire one TTL from now (epoch millis, no new Date)', async () => {
      const { user } = await useCase.execute(command());
      expect(user.setupCodeExpiresAt).toBe(new Date(NOW).getTime() + SETUP_CODE_TTL_MS);
    });

    it('carries a fresh envelope stamped by the inviting director', async () => {
      const { user } = await useCase.execute(command());
      expect(user.updatedBy).toBe('usr_00000000000000000000000001');
      expect(user.centerCode).toBe('CS-CASA-001');
      expect(user.version).toBe(0);
      expect(user.deletedAt).toBeNull();
      expect(user.createdAt).toEqual(new Date(NOW));
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
    it('rejects an owner invite — the owner is minted only at first-run', async () => {
      await expect(useCase.execute(command({ role: 'owner' }))).rejects.toBeInstanceOf(
        RoleNotInvitableError,
      );
      expect(users.all()).toHaveLength(0);
    });

    it('rejects an admin invite', async () => {
      await expect(useCase.execute(command({ role: 'admin' }))).rejects.toBeInstanceOf(
        RoleNotInvitableError,
      );
      expect(users.all()).toHaveLength(0);
    });

    it('rejects a viewer invite', async () => {
      await expect(useCase.execute(command({ role: 'viewer' }))).rejects.toBeInstanceOf(
        RoleNotInvitableError,
      );
    });
  });
});
