import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SetOwnerEmail } from '../../../src/use-cases/set-owner-email';
import { InvalidEmailError, type Email } from '../../../src/value-objects/email';
import { UserNotFoundError } from '../../../src/errors/user-errors';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { fakeClock } from '../fakes/clock';
import type { User, UserId } from '../../../src/entities/user';
import type { CenterCode, DeviceId } from '../../../src/value-objects/ids';

const CREATED = '2026-07-01T08:00:00Z';
const NOW = '2026-07-29T10:00:00Z';
const OWNER_ID = 'usr_00000000000000000000000001' as UserId;

function owner(over: Partial<User> = {}): User {
  return {
    id: OWNER_ID,
    centerCode: 'CS-CASA-001' as CenterCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: new Date(CREATED),
    updatedAt: new Date(CREATED),
    updatedBy: OWNER_ID,
    deletedAt: null,
    version: 0,
    role: 'owner',
    username: 'directrice',
    passwordHash: '$argon2id$hash',
    setupCodeHash: null,
    setupCodeExpiresAt: null,
    setupCodeRedeemedAt: null,
    email: null,
    ...over,
  };
}

describe('SetOwnerEmail', () => {
  let users: InMemoryUserRepository;
  let useCase: SetOwnerEmail;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    useCase = new SetOwnerEmail(users, fakeClock(NOW));
  });

  it('normalizes (trim + lower-case) and persists a valid email', async () => {
    await users.save(owner());

    const result = await useCase.execute({ email: '  Directrice@Example.COM ' });

    expect(result.email).toBe('directrice@example.com');
    expect((await users.findOwner())?.email).toBe('directrice@example.com' as Email);
  });

  it('bumps updatedAt/updatedBy when the email actually changes', async () => {
    await users.save(owner());

    const result = await useCase.execute({ email: 'directrice@example.com' });

    expect(result.updatedAt).toEqual(new Date(NOW));
    expect(result.updatedBy).toBe(OWNER_ID);
  });

  it('clears an existing email when given null', async () => {
    await users.save(owner({ email: 'old@example.com' as Email, updatedAt: new Date(CREATED) }));

    const result = await useCase.execute({ email: null });

    expect(result.email).toBeNull();
    expect(result.updatedAt).toEqual(new Date(NOW));
  });

  it('treats a blank string as clearing the address', async () => {
    await users.save(owner({ email: 'old@example.com' as Email }));

    const result = await useCase.execute({ email: '   ' });

    expect(result.email).toBeNull();
  });

  it('is a no-op (no updatedAt bump, no save/sync delta) when the owner has no email and none is set', async () => {
    await users.save(owner());
    const save = vi.spyOn(users, 'save');

    const result = await useCase.execute({ email: null });

    expect(result.email).toBeNull();
    expect(result.updatedAt).toEqual(new Date(CREATED));
    // An unchanged email must not re-save: the SQLite repo writes a change-log
    // entry on every save, so a redundant save is spurious replication traffic.
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects an invalid email and leaves the stored account untouched', async () => {
    await users.save(owner());

    await expect(useCase.execute({ email: 'not-an-email' })).rejects.toThrow(InvalidEmailError);

    const stored = await users.findOwner();
    expect(stored?.email).toBeNull();
    expect(stored?.updatedAt).toEqual(new Date(CREATED));
  });

  it('throws UserNotFoundError when no owner exists', async () => {
    await expect(useCase.execute({ email: 'directrice@example.com' })).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
