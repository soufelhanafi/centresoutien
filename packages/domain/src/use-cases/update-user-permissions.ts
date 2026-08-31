import type { UserRepository } from '../ports/user-repository';
import type { Clock } from '../ports/clock';
import type { UserId } from '../value-objects/ids';
import type { User } from '../entities/user';
import type { PermissionFlag } from '../permissions/permissions';
import { CannotRestrictOwnerError, UserNotFoundError } from '../errors/user-errors';

export type UpdateUserPermissionsCommand = {
  userId: UserId;
  permissions: ReadonlySet<PermissionFlag>;
  updatedBy: UserId;
};

// Owner-facing write behind the team roster's permission switches: replaces the
// target account's whole `permissions` set (the UI sends every flag's checked
// state at once, not a single toggle) and bumps the envelope like any other
// in-place field edit. Rejects `role: 'owner'` targets outright — an owner's
// stored permissions are never consulted, so silently accepting the write would
// let the director believe they had restricted an access that never changed.
export class UpdateUserPermissions {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: UpdateUserPermissionsCommand): Promise<User> {
    const user = await this.users.findById(command.userId);
    if (user === null) throw new UserNotFoundError();
    if (user.role === 'owner') throw new CannotRestrictOwnerError();

    const updated: User = {
      ...user,
      permissions: command.permissions,
      updatedAt: this.clock.now(),
      updatedBy: command.updatedBy,
    };
    await this.users.save(updated);
    return updated;
  }
}
