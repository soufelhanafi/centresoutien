import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { MembershipRepository } from '../../../src/ports/membership-repository';
import type { Membership, MembershipId } from '../../../src/entities/membership';
import type { CenterCode, UserId } from '../../../src/value-objects/ids';

/**
 * In-memory {@link MembershipRepository} for use-case tests — no infra import.
 * Inherits the soft-delete semantics (reads skip tombstones) and adds the two
 * membership lookups, both of which exclude revoked (tombstoned) rows.
 */
export class InMemoryMembershipRepository
  extends InMemorySoftDeletableRepository<MembershipId, Membership>
  implements MembershipRepository
{
  async findByUserAndCentre(userId: UserId, centreId: CenterCode): Promise<Membership | null> {
    const match = [...this.rows.values()].find(
      (row) =>
        row.deletedAt === null &&
        row.userId === userId &&
        row.centreId === centreId &&
        row.centerCode === centreId,
    );
    return match ? structuredClone(match) : null;
  }

  async listByUser(userId: UserId): Promise<readonly Membership[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.userId === userId)
      .map((row) => structuredClone(row));
  }
}
