import { newEnvelope } from '../../../src/entities/envelope';
import { USER_ID_PREFIX, SETUP_CODE_TTL_MS, type User } from '../../../src/entities/user';
import type { Clock } from '../../../src/ports/clock';
import type { IdGenerator } from '../../../src/ports/id-generator';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeHasher } from './hasher';
import { fakeIds } from './ids';
import type { InMemoryUserRepository } from './in-memory-user-repository';

// A repository that can persist a seeded row — the in-memory fake's `save`.
type Seedable = Pick<InMemoryUserRepository, 'save'>;

// Seeds an un-onboarded pending invite directly: a row carrying a hashed setup code
// and no password, with a placeholder username (its own id). The product no longer
// mints these — direct account creation sets a password immediately — but the
// setup-code validation/redemption use cases still exist to serve any such row, so
// their unit tests seed the fixture here rather than through a create use case. The
// hash matches `fakeHasher` (`hashed:${code}`) so the code verifies at redemption.
export async function seedPendingInvite(
  users: Seedable,
  clock: Clock,
  context: { centerCode: CenterCode; deviceOrigin: DeviceId; updatedBy: UserId },
  setupCode: string,
  ids: IdGenerator = fakeIds(),
): Promise<User> {
  const id = ids.next(USER_ID_PREFIX) as UserId;
  const user: User = {
    id,
    ...newEnvelope(context, clock),
    role: 'secretary',
    username: id,
    fullName: null,
    passwordHash: null,
    setupCodeHash: await fakeHasher().hash(setupCode),
    setupCodeExpiresAt: clock.now().getTime() + SETUP_CODE_TTL_MS,
    setupCodeRedeemedAt: null,
    email: null,
  };
  await users.save(user);
  return user;
}
