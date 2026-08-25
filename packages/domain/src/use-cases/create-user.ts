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
import { InvalidUserRoleError, RoleNotInvitableError } from '../errors/user-errors';
import { generateSetupCode } from './setup-code';

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

// Invites an employee (SOU-303, code-first): the director supplies ONLY a role, and
// this mints a single-use setup code the employee later redeems to set their own
// username, full name, email, and password. No identity and no password are created
// here — the director never sees or sets either — so the row is born with a
// non-final PLACEHOLDER username (its own id, unique per row so two open invites
// never collide on the live-username index) and a `null` `fullName`/`email`.
//
// The role must be known (fail-closed, SOU-95) AND invitable — the invite path may
// only mint a `secretary`; `owner`/`admin`/`viewer` are rejected so an invite can
// never bypass the first-run owner guard or grant a privileged role. The role is
// carried by the code and can never be self-asserted at redemption. Only the code's
// hash is stored; the plaintext is returned once for on-screen delivery.
export class CreateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly random: SecureRandom,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateUserCommand): Promise<CreateUserResult> {
    const { role } = createUserInputSchema.parse({ role: command.role });

    if (!isRole(role)) throw new InvalidUserRoleError(role);
    if (!isInvitableRole(role)) throw new RoleNotInvitableError(role);

    const now = this.clock.now();
    const setupCode = generateSetupCode(this.random);
    const id = this.ids.next(USER_ID_PREFIX) as UserId;

    const user: User = {
      id,
      ...newEnvelope(
        {
          centerCode: command.centerCode,
          deviceOrigin: command.deviceOrigin,
          updatedBy: command.updatedBy,
        },
        this.clock,
      ),
      role,
      username: id,
      fullName: null,
      passwordHash: null,
      setupCodeHash: await this.hasher.hash(setupCode),
      setupCodeExpiresAt: now.getTime() + SETUP_CODE_TTL_MS,
      setupCodeRedeemedAt: null,
      email: null,
    };

    await this.users.save(user);
    return { user, setupCode };
  }
}
