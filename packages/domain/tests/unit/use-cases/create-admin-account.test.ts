import { describe, it, expect, beforeEach } from 'vitest';
import {
  CreateAdminAccount,
  type CreateAdminAccountInput,
} from '../../../src/use-cases/create-admin-account';
import { OwnerAlreadyExistsError, UsernameAlreadyTakenError } from '../../../src/errors/user-errors';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import type { CenterCode, DeviceId } from '../../../src/value-objects/ids';

const CONTEXT = {
  centerCode: 'CS-CASA-001' as CenterCode,
  deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
};

function validInput(overrides: Partial<CreateAdminAccountInput> = {}): CreateAdminAccountInput {
  return {
    username: '  directrice ',
    password: 'Casa2026!',
    ...overrides,
  };
}

describe('CreateAdminAccount (owner first-run)', () => {
  let users: InMemoryUserRepository;
  let useCase: CreateAdminAccount;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    useCase = new CreateAdminAccount(
      users,
      fakeHasher(),
      fakeClock('2026-07-29T10:00:00Z'),
      fakeIds(),
      CONTEXT,
    );
  });

  describe('happy path', () => {
    it('creates the owner with a prefixed id, trimmed username, owner role, and fresh timestamps', async () => {
      const owner = await useCase.execute(validInput());

      expect(owner.id).toMatch(/^usr_/);
      expect(owner.role).toBe('owner');
      expect(owner.username).toBe('directrice');
      expect(owner.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(owner.updatedAt).toEqual(owner.createdAt);
    });

    it('sets the owner as its own last editor and carries the bootstrap envelope', async () => {
      const owner = await useCase.execute(validInput());
      expect(owner.updatedBy).toBe(owner.id);
      expect(owner.centerCode).toBe('CS-CASA-001');
      expect(owner.deviceOrigin).toBe('dev_00000000000000000000000001');
      expect(owner.version).toBe(0);
    });

    it('sets a password immediately with no pending setup code', async () => {
      const owner = await useCase.execute(validInput());
      expect(owner.passwordHash).toBe('hashed:Casa2026!');
      expect(owner.passwordHash).not.toBe('Casa2026!');
      expect(owner.setupCodeHash).toBeNull();
      expect(owner.setupCodeRedeemedAt).toBeNull();
    });

    it('persists the owner so it can be read back by username', async () => {
      const owner = await useCase.execute(validInput());
      expect(await users.findByUsername('directrice')).toEqual(owner);
    });
  });

  describe('single-owner invariant', () => {
    it('rejects a second owner when one already exists', async () => {
      await useCase.execute(validInput());
      await expect(useCase.execute(validInput({ username: 'autre' }))).rejects.toBeInstanceOf(
        OwnerAlreadyExistsError,
      );
      expect(users.all()).toHaveLength(1);
    });
  });

  describe('username uniqueness', () => {
    it('rejects a duplicate username even before an owner exists is irrelevant — owner guard fires first', async () => {
      await useCase.execute(validInput());
      // Same username, but the owner guard rejects before username is checked.
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(OwnerAlreadyExistsError);
    });
  });

  describe('password policy', () => {
    it('rejects a password below the minimum length', async () => {
      await expect(useCase.execute(validInput({ password: 'Ab1' }))).rejects.toThrow();
      expect(users.all()).toHaveLength(0);
    });

    it('rejects a password missing an uppercase letter', async () => {
      await expect(useCase.execute(validInput({ password: 'casa2026!' }))).rejects.toThrow();
    });

    it('rejects a password missing a digit', async () => {
      await expect(useCase.execute(validInput({ password: 'CasablancaX' }))).rejects.toThrow();
    });

    it('rejects a blank username', async () => {
      await expect(useCase.execute(validInput({ username: '  ' }))).rejects.toThrow();
      expect(users.all()).toHaveLength(0);
    });
  });
});

// Guards that the exported error is wired for the renderer's stable-code transport.
describe('UsernameAlreadyTakenError', () => {
  it('carries a stable code', () => {
    expect(new UsernameAlreadyTakenError('x').code).toBe('username-already-taken');
  });
});
