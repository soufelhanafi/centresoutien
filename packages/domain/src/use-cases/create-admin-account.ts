import type { UserRepository } from '../ports/user-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { adminCredentialsSchema, type AdminCredentials } from '../schemas/admin-account';
import { OwnerAlreadyExistsError } from '../errors/user-errors';
import { newEnvelope } from '../entities/envelope';
import { USER_ID_PREFIX, type User } from '../entities/user';

export type CreateAdminAccountInput = AdminCredentials;

// Creates the center's owner account on first run (SOU-26, multi-user in SOU-252).
// The first-run wizard writes a User with `role: 'owner'` and a password set
// immediately (no setup code — the director chooses their own password here).
// Validates credentials with the shared schema (password strength included) and
// hashes through the injected PasswordHasher — the plaintext is never persisted.
// Not plan-gated: auth is foundational.
//
// Enforces the single-owner invariant (OwnerAlreadyExistsError). Per-center
// username uniqueness is guaranteed by the DB partial-unique index (no separate
// check here — the owner guard fires first at first-run, so a username check would
// be dead). `centerCode`/`deviceOrigin` are the bootstrap envelope context;
// `updatedBy` is the owner's own id, the one self-referential write in the system.
export class CreateAdminAccount {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly context: { centerCode: CenterCode; deviceOrigin: DeviceId },
  ) {}

  async execute(input: CreateAdminAccountInput): Promise<User> {
    const { username, password } = adminCredentialsSchema.parse(input);

    if ((await this.users.findOwner()) !== null) throw new OwnerAlreadyExistsError();

    const id = this.ids.next(USER_ID_PREFIX) as UserId;
    const owner: User = {
      id,
      ...newEnvelope(
        {
          centerCode: this.context.centerCode,
          deviceOrigin: this.context.deviceOrigin,
          updatedBy: id,
        },
        this.clock,
      ),
      role: 'owner',
      username,
      // The first-run wizard captures credentials only; the owner's display name is
      // set later through the account, so it starts null (SOU-303).
      fullName: null,
      passwordHash: await this.hasher.hash(password),
      setupCodeHash: null,
      setupCodeExpiresAt: null,
      setupCodeRedeemedAt: null,
      email: null,
    };

    await this.users.save(owner);
    return owner;
  }
}
