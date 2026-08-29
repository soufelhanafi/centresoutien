import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type {
  UserRepository,
  SetupCodeRedemption,
  SetupCodeReissue,
} from '../../../src/ports/user-repository';
import type { User, UserId } from '../../../src/entities/user';
import type { CenterCode } from '../../../src/value-objects/ids';
import { normalizeUsername } from '../../../src/policies/username-normalization';
import { UsernameAlreadyTakenError } from '../../../src/errors/user-errors';

/**
 * In-memory {@link UserRepository} for unit tests. Reuses the shared
 * soft-deletable base (save / findById / softDelete / listChangedSince / all)
 * and adds the username lookup and owner/active reads. `findByUsername` matches
 * via {@link normalizeUsername} on live rows only, mirroring the SQLite adapter's
 * normalized-column lookup and its tombstone exclusion.
 */
export class InMemoryUserRepository
  extends InMemorySoftDeletableRepository<UserId, User>
  implements UserRepository
{
  async findByUsername(username: string): Promise<User | null> {
    const target = normalizeUsername(username);
    for (const row of this.rows.values()) {
      if (row.deletedAt === null && normalizeUsername(row.username) === target) {
        return structuredClone(row);
      }
    }
    return null;
  }

  // Atomic create-time guard, mirroring the SQLite adapter: the same-username
  // clash check and the insert are one synchronous unit, so a collision is a hard
  // rejection. Scoped to the account's own center, like the adapter's guard.
  async createLocalAccount(user: User): Promise<void> {
    const target = normalizeUsername(user.username);
    for (const row of this.rows.values()) {
      if (
        row.id !== user.id &&
        row.deletedAt === null &&
        row.centerCode === user.centerCode &&
        normalizeUsername(row.username) === target
      ) {
        throw new UsernameAlreadyTakenError(user.username);
      }
    }
    await this.save(user);
  }

  async listActive(centerCode: CenterCode): Promise<readonly User[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.centerCode === centerCode)
      .map((row) => structuredClone(row));
  }

  async findOwner(): Promise<User | null> {
    for (const row of this.rows.values()) {
      if (row.deletedAt === null && row.role === 'owner') return structuredClone(row);
    }
    return null;
  }

  // Ids treated as device-local (a migrated owner). Empty by default, so every
  // account participates in sync — the common case for deliberately-created users.
  readonly deviceLocalIds = new Set<UserId>();

  async participatesInSync(userId: UserId): Promise<boolean> {
    return !this.deviceLocalIds.has(userId);
  }

  async listPendingInvites(): Promise<readonly User[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.deletedAt === null &&
          row.setupCodeHash !== null &&
          row.setupCodeRedeemedAt === null,
      )
      .map((row) => structuredClone(row));
  }

  // Compare-and-set redemption, mirroring the SQLite adapter's conditional UPDATE:
  // applies only while the row is still pending on `expectedSetupCodeHash` and not
  // yet redeemed, so two concurrent redemptions cannot both win. When `identity` is
  // present it also writes the chosen username/full name/email, rejecting a
  // colliding live username exactly as the uniqueness index does.
  async markSetupCodeRedeemed(redemption: SetupCodeRedemption): Promise<boolean> {
    const row = this.rows.get(redemption.id);
    if (!row || row.deletedAt !== null) return false;
    if (row.setupCodeHash !== redemption.expectedSetupCodeHash) return false;
    if (row.setupCodeRedeemedAt !== null) return false;
    if (redemption.identity) {
      const target = normalizeUsername(redemption.identity.username);
      for (const other of this.rows.values()) {
        if (
          other.id !== row.id &&
          other.deletedAt === null &&
          normalizeUsername(other.username) === target
        ) {
          throw new UsernameAlreadyTakenError(redemption.identity.username);
        }
      }
      row.username = redemption.identity.username;
      row.fullName = redemption.identity.fullName;
      row.email = redemption.identity.email;
    }
    row.passwordHash = redemption.passwordHash;
    row.setupCodeHash = null;
    row.setupCodeExpiresAt = null;
    row.setupCodeRedeemedAt = redemption.redeemedAt;
    row.updatedAt = redemption.redeemedAt;
    row.updatedBy = redemption.updatedBy;
    return true;
  }

  // Targeted re-issue: rotates only the setup-code fields on a live row, mirroring
  // the SQLite adapter — identity/credentials are never touched.
  async reopenSetupCode(reissue: SetupCodeReissue): Promise<User | null> {
    const row = this.rows.get(reissue.id);
    if (!row || row.deletedAt !== null) return null;
    row.setupCodeHash = reissue.setupCodeHash;
    row.setupCodeExpiresAt = reissue.setupCodeExpiresAt;
    row.setupCodeRedeemedAt = null;
    row.updatedAt = reissue.updatedAt;
    row.updatedBy = reissue.updatedBy;
    return structuredClone(row);
  }
}
