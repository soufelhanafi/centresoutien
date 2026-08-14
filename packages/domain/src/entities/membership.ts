import type { Brand } from '../value-objects/brand';
import type { CenterCode, UserId } from '../value-objects/ids';
import type { Role } from '../value-objects/role';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for memberships: `mbr_01HW…`. */
export const MEMBERSHIP_ID_PREFIX = 'mbr';

export type MembershipId = Brand<string, 'MembershipId'>;

/**
 * Binds a user to a center with a single {@link Role} (CLAUDE.md §5ter). A user
 * belongs to N centers, with possibly different roles in each — membership is
 * the join, not a property of either side.
 *
 * `centreId` is the center this membership grants access to; in the
 * one-DB-per-center model it mirrors the envelope's `centerCode`, but it is kept
 * explicit so authorization compares the **selected** center against it directly
 * and stays correct if memberships are ever consolidated in the cloud tier.
 * `userId` and `centreId` are `readonly`: re-pointing a membership is a revoke
 * (soft delete) plus a new row, never an in-place move. Only `role` changes in
 * place — a promotion/demotion. Never hard-deleted.
 */
export type Membership = EntityEnvelope & {
  readonly id: MembershipId;
  readonly userId: UserId;
  readonly centreId: CenterCode;
  role: Role;
};
