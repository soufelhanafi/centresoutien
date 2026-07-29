import { describe, it, expect, beforeEach } from 'vitest';
import { CreateAdminAccount } from '../../../src/use-cases/create-admin-account';
import { VerifyAdminPassword } from '../../../src/use-cases/verify-admin-password';
import { InMemoryAdminAccountRepository } from '../fakes/in-memory-admin-account-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

describe('VerifyAdminPassword', () => {
  let accounts: InMemoryAdminAccountRepository;
  let verify: VerifyAdminPassword;

  beforeEach(async () => {
    accounts = new InMemoryAdminAccountRepository();
    const hasher = fakeHasher();
    await new CreateAdminAccount(accounts, hasher, fakeClock(), fakeIds()).execute({
      username: 'directrice',
      password: 'Casa2026!',
    });
    verify = new VerifyAdminPassword(accounts, hasher);
  });

  it('accepts the correct username and password', async () => {
    expect(await verify.execute({ username: 'directrice', password: 'Casa2026!' })).toBe(true);
  });

  it('rejects a wrong password', async () => {
    expect(await verify.execute({ username: 'directrice', password: 'Wrong2026!' })).toBe(false);
  });

  it('rejects an unknown username without throwing', async () => {
    expect(await verify.execute({ username: 'ghost', password: 'Casa2026!' })).toBe(false);
  });

  it('trims the username so a trailing space still matches the stored account', async () => {
    expect(await verify.execute({ username: '  directrice ', password: 'Casa2026!' })).toBe(true);
  });
});
