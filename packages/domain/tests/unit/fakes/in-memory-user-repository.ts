import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { UserRepository, SetupCodeRedemption } from '../../../src/ports/user-repository';
import type { User, UserId } from '../../../src/entities/user';
import type { CenterCode } from '../../../src/value-objects/ids';
import { normalizeUsername } from '../../../src/policies/username-normalization';

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

  // Compare-and-set redemption, mirroring the SQLite adapter's conditional UPDATE:
  // applies only while the row is still pending on `expectedSetupCodeHash` and not
  // yet redeemed, so two concurrent redemptions cannot both win.
  async markSetupCodeRedeemed(redemption: SetupCodeRedemption): Promise<boolean> {
    const row = this.rows.get(redemption.id);
    if (!row || row.deletedAt !== null) return false;
    if (row.setupCodeHash !== redemption.expectedSetupCodeHash) return false;
    if (row.setupCodeRedeemedAt !== null) return false;
    row.passwordHash = redemption.passwordHash;
    row.setupCodeHash = null;
    row.setupCodeExpiresAt = null;
    row.setupCodeRedeemedAt = redemption.redeemedAt;
    row.updatedAt = redemption.redeemedAt;
    row.updatedBy = redemption.updatedBy;
    return true;
  }
}
