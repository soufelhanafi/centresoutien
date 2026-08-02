import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChangeAdminPassword,
  type ChangeAdminPasswordInput,
} from '../../../src/use-cases/change-admin-password';
import {
  AdminAccountNotFoundError,
  InvalidCurrentPasswordError,
} from '../../../src/errors/auth-errors';
import type { AdminAccount, AdminAccountId } from '../../../src/entities/admin-account';
import { InMemoryAdminAccountRepository } from '../fakes/in-memory-admin-account-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';

const CREATED_AT = new Date('2026-07-29T10:00:00Z');
const CHANGED_AT = new Date('2026-08-01T09:00:00Z');

function seedAccount(
  accounts: InMemoryAdminAccountRepository,
  over: Partial<AdminAccount> = {},
): Promise<void> {
  const account: AdminAccount = {
    id: 'adm_00000000000000000000000001' as AdminAccountId,
    username: 'directrice',
    passwordHash: 'hashed:Casa2026!',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...over,
  };
  return accounts.save(account);
}

function validInput(overrides: Partial<ChangeAdminPasswordInput> = {}): ChangeAdminPasswordInput {
  return {
    currentPassword: 'Casa2026!',
    newPassword: 'Rabat2027!',
    ...overrides,
  };
}

describe('ChangeAdminPassword', () => {
  let accounts: InMemoryAdminAccountRepository;
  let useCase: ChangeAdminPassword;

  beforeEach(() => {
    accounts = new InMemoryAdminAccountRepository();
    useCase = new ChangeAdminPassword(accounts, fakeHasher(), fakeClock(CHANGED_AT.toISOString()));
  });

  describe('happy path', () => {
    it('re-hashes the new password and bumps updatedAt, preserving id/username/createdAt', async () => {
      await seedAccount(accounts);

      await useCase.execute(validInput());

      const account = await accounts.findByUsername('directrice');
      expect(account?.passwordHash).toBe('hashed:Rabat2027!');
      expect(account?.updatedAt).toEqual(CHANGED_AT);
      expect(account?.createdAt).toEqual(CREATED_AT);
      expect(account?.id).toBe('adm_00000000000000000000000001');
    });
  });

  describe('wrong current password', () => {
    it('rejects with InvalidCurrentPasswordError and leaves the stored hash untouched', async () => {
      await seedAccount(accounts);

      await expect(
        useCase.execute(validInput({ currentPassword: 'WrongPass1' })),
      ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);

      const account = await accounts.findByUsername('directrice');
      expect(account?.passwordHash).toBe('hashed:Casa2026!');
    });
  });

  describe('no admin account', () => {
    it('rejects with AdminAccountNotFoundError when none exists', async () => {
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(AdminAccountNotFoundError);
    });
  });

  describe('new password policy', () => {
    it('rejects a new password below the minimum length', async () => {
      await seedAccount(accounts);
      await expect(useCase.execute(validInput({ newPassword: 'Ab1' }))).rejects.toThrow();
    });

    it('rejects a new password missing an uppercase letter', async () => {
      await seedAccount(accounts);
      await expect(useCase.execute(validInput({ newPassword: 'rabat2027!' }))).rejects.toThrow();
    });

    it('rejects a new password missing a digit', async () => {
      await seedAccount(accounts);
      await expect(useCase.execute(validInput({ newPassword: 'RabatCity' }))).rejects.toThrow();
    });

    it('rejects a blank current password', async () => {
      await seedAccount(accounts);
      await expect(useCase.execute(validInput({ currentPassword: '' }))).rejects.toThrow();
    });
  });
});
