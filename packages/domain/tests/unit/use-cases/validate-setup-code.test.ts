import { describe, it, expect, beforeEach } from 'vitest';
import { CreateUser } from '../../../src/use-cases/create-user';
import { ValidateSetupCode } from '../../../src/use-cases/validate-setup-code';
import { SETUP_CODE_TTL_MS } from '../../../src/entities/user';
import { SetupCodeInvalidError, SetupCodeExpiredError } from '../../../src/errors/user-errors';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeSecureRandom } from '../fakes/secure-random';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const NOW = '2026-07-29T10:00:00Z';
const CONTEXT = {
  centerCode: 'CS-CASA-001' as CenterCode,
  deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
  updatedBy: 'usr_00000000000000000000000001' as UserId,
};

describe('ValidateSetupCode (code-first step 1)', () => {
  let users: InMemoryUserRepository;
  let clock: ReturnType<typeof fakeClock>;
  let validate: ValidateSetupCode;
  let setupCode: string;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    clock = fakeClock(NOW);
    validate = new ValidateSetupCode(users, fakeHasher(), clock);
    ({ setupCode } = await new CreateUser(
      users,
      fakeHasher(),
      fakeSecureRandom(),
      clock,
      fakeIds(),
    ).execute({ role: 'secretary', ...CONTEXT }));
  });

  it('returns the role bound to the code and flags that identity is still needed', async () => {
    const result = await validate.execute({ setupCode });
    expect(result).toEqual({ role: 'secretary', needsIdentity: true });
  });

  it('rejects a wrong code opaquely', async () => {
    await expect(validate.execute({ setupCode: 'ZZZZ-ZZZZ-ZZZZ' })).rejects.toBeInstanceOf(
      SetupCodeInvalidError,
    );
  });

  it('rejects an expired code distinctly from an invalid one', async () => {
    clock.advance(SETUP_CODE_TTL_MS + 1);
    await expect(validate.execute({ setupCode })).rejects.toBeInstanceOf(SetupCodeExpiredError);
  });
});
