import { describe, it, expect, beforeEach } from 'vitest';
import {
  CreateAdminAccount,
  type CreateAdminAccountInput,
} from '../../../src/use-cases/create-admin-account';
import { AdminAccountAlreadyExistsError } from '../../../src/errors/auth-errors';
import { InMemoryAdminAccountRepository } from '../fakes/in-memory-admin-account-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

function validInput(overrides: Partial<CreateAdminAccountInput> = {}): CreateAdminAccountInput {
  return {
    username: '  directrice ',
    password: 'Casa2026!',
    ...overrides,
  };
}

describe('CreateAdminAccount', () => {
  let accounts: InMemoryAdminAccountRepository;
  let useCase: CreateAdminAccount;

  beforeEach(() => {
    accounts = new InMemoryAdminAccountRepository();
    useCase = new CreateAdminAccount(
      accounts,
      fakeHasher(),
      fakeClock('2026-07-29T10:00:00Z'),
      fakeIds(),
    );
  });

  describe('happy path', () => {
    it('creates the account with a prefixed id, trimmed username, and fresh timestamps', async () => {
      const account = await useCase.execute(validInput());

      expect(account.id).toMatch(/^adm_/);
      expect(account.username).toBe('directrice');
      expect(account.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(account.updatedAt).toEqual(account.createdAt);
    });

    it('stores the hasher output, not the raw password', async () => {
      // The transparent fake encodes as `hashed:<plain>`; that the stored value
      // is the hasher's output (and not the plaintext) is the point. The real
      // no-plaintext guarantee against Argon2 is proven in the adapter's
      // integration test.
      const account = await useCase.execute(validInput());

      expect(account.passwordHash).toBe('hashed:Casa2026!');
      expect(account.passwordHash).not.toBe('Casa2026!');
    });

    it('persists the account so it can be read back by username', async () => {
      const account = await useCase.execute(validInput());
      expect(await accounts.findByUsername('directrice')).toEqual(account);
    });
  });

  describe('single-admin invariant', () => {
    it('rejects a second account when one already exists', async () => {
      await useCase.execute(validInput());
      await expect(useCase.execute(validInput({ username: 'autre' }))).rejects.toBeInstanceOf(
        AdminAccountAlreadyExistsError,
      );
      expect(accounts.all()).toHaveLength(1);
    });
  });

  describe('password policy', () => {
    it('rejects a password below the minimum length', async () => {
      await expect(useCase.execute(validInput({ password: 'Ab1' }))).rejects.toThrow();
      expect(accounts.all()).toHaveLength(0);
    });

    it('rejects a password missing an uppercase letter', async () => {
      await expect(useCase.execute(validInput({ password: 'casa2026!' }))).rejects.toThrow();
    });

    it('rejects a password missing a digit', async () => {
      await expect(useCase.execute(validInput({ password: 'CasablancaX' }))).rejects.toThrow();
    });

    it('rejects a blank username', async () => {
      await expect(useCase.execute(validInput({ username: '  ' }))).rejects.toThrow();
      expect(accounts.all()).toHaveLength(0);
    });
  });
});
