import type { UserRepository } from '../ports/user-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { isRole, isInvitableRole } from '../value-objects/role';
import { newEnvelope } from '../entities/envelope';
import { createUserInputSchema, type CreateUserInput } from '../schemas/user';
import { USER_ID_PREFIX, type User } from '../entities/user';
import {
  InvalidUserRoleError,
  RoleNotInvitableError,
  UsernameAlreadyTakenError,
} from '../errors/user-errors';

export type CreateUserCommand = CreateUserInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

// The account the director just created — active and ready to sign in. Unlike the
// old code-first invite there is no one-time code to hand back: the director set the
// credentials, so nothing secret crosses the boundary here.
export type CreateUserResult = {
  readonly user: User;
};

// Creates an employee account directly (single-laptop model): the director supplies
// the login username, password, and an optional display name, and the account is
// born ACTIVE — the password is hashed immediately and no setup code is minted. The
// employee signs in with those credentials with no redemption step. Mirrors
// {@link CreateAdminAccount}, which creates the owner the same way at first-run.
//
// The role must be known (fail-closed, SOU-95) AND invitable — the create path may
// only mint a `secretary`; `owner`/`admin`/`viewer` are rejected so it can never
// bypass the first-run owner guard or grant a privileged role. The username is
// unique per center among live rows: a collision with an existing account is a hard
// rejection (`UsernameAlreadyTakenError`), never a merge — accounts are created
// deliberately, not matched in from two devices.
export class CreateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateUserCommand): Promise<CreateUserResult> {
    const { role, username, password, fullName } = createUserInputSchema.parse(command);

    if (!isRole(role)) throw new InvalidUserRoleError(role);
    if (!isInvitableRole(role)) throw new RoleNotInvitableError(role);

    if ((await this.users.findByUsername(username)) !== null) {
      throw new UsernameAlreadyTakenError(username);
    }

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
      username,
      fullName: fullName && fullName.length > 0 ? fullName : null,
      passwordHash: await this.hasher.hash(password),
      setupCodeHash: null,
      setupCodeExpiresAt: null,
      setupCodeRedeemedAt: null,
      email: null,
    };

    await this.users.save(user);
    return { user };
  }
}
