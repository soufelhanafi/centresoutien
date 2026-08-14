import type { UserRepository } from '../ports/user-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { SecureRandom } from '../ports/secure-random';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { isRole, isInvitableRole } from '../value-objects/role';
import { newEnvelope } from '../entities/envelope';
import { createUserInputSchema, type CreateUserInput } from '../schemas/user';
import { USER_ID_PREFIX, SETUP_CODE_TTL_MS, type User } from '../entities/user';
import {
  UsernameAlreadyTakenError,
  InvalidUserRoleError,
  RoleNotInvitableError,
} from '../errors/user-errors';

export type CreateUserCommand = CreateUserInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

// A newly invited user together with the ONE-TIME setup code, returned exactly
// once so the director can hand it to the employee on-screen. The plaintext code
// is never persisted (only its hash is) and never logged — this is its sole
// appearance.
export type CreateUserResult = {
  readonly user: User;
  readonly setupCode: string;
};

// 32 unambiguous glyphs (Crockford-ish: no 0/O, 1/I). Exactly divides 256, so a
// plain `byte % 32` is uniform over the alphabet — no rejection sampling needed.
const SETUP_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SETUP_CODE_GROUPS = 3;
const SETUP_CODE_GROUP_LEN = 4;

// A human-readable one-time setup code (e.g. `A7K2-9FMP-3QRT`) drawn from the
// cryptographically secure SecureRandom. Each byte maps uniformly onto the
// 32-glyph alphabet (which divides 256 evenly).
function generateSetupCode(random: SecureRandom): string {
  const total = SETUP_CODE_GROUPS * SETUP_CODE_GROUP_LEN;
  const bytes = random.bytes(total);
  const groups: string[] = [];
  for (let g = 0; g < SETUP_CODE_GROUPS; g++) {
    let group = '';
    for (let i = 0; i < SETUP_CODE_GROUP_LEN; i++) {
      const byte = bytes[g * SETUP_CODE_GROUP_LEN + i] ?? 0;
      group += SETUP_CODE_ALPHABET.charAt(byte % SETUP_CODE_ALPHABET.length);
    }
    groups.push(group);
  }
  return groups.join('-');
}

// Invites an employee (SOU-252): the director supplies a username + role, and this
// mints a single-use setup code that the employee redeems to set their own
// password. No password is created here — `passwordHash` stays `null` until
// RedeemSetupCode runs — so the director never learns the employee's password.
//
// The role must be known (fail-closed, SOU-95) AND invitable — the invite path may
// only mint a `secretary`; `owner`/`admin`/`viewer` are rejected so an invite can
// never bypass the first-run owner guard or grant a privileged role. Username must
// be unique per center among live accounts (UsernameAlreadyTakenError). Only the
// code's hash is stored; the plaintext is returned once for on-screen delivery.
export class CreateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly random: SecureRandom,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateUserCommand): Promise<CreateUserResult> {
    const { username, role } = createUserInputSchema.parse({
      username: command.username,
      role: command.role,
    });

    if (!isRole(role)) throw new InvalidUserRoleError(role);
    if (!isInvitableRole(role)) throw new RoleNotInvitableError(role);

    const clash = await this.users.findByUsername(username);
    if (clash !== null) throw new UsernameAlreadyTakenError(username);

    const now = this.clock.now();
    const setupCode = generateSetupCode(this.random);

    const user: User = {
      id: this.ids.next(USER_ID_PREFIX) as UserId,
      ...newEnvelope(
        {
          centerCode: command.centerCode,
          deviceOrigin: command.deviceOrigin,
          updatedBy: command.updatedBy,
        },
        this.clock,
      ),
      role,
      username,
      passwordHash: null,
      setupCodeHash: await this.hasher.hash(setupCode),
      setupCodeExpiresAt: now.getTime() + SETUP_CODE_TTL_MS,
      setupCodeRedeemedAt: null,
    };

    await this.users.save(user);
    return { user, setupCode };
  }
}
