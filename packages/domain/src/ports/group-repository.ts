import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Group, GroupId } from '../entities/group';

/**
 * Persistence port for Groups. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`); reads exclude
 * tombstones, and there is no hard delete. Groups are identified by their
 * relationships, not people-like matching, so there is no `findByNaturalKey`.
 *
 * The list/count reads the group screens need, plus the SQLite adapter and its
 * migration, land in the Group repository follow-up (mirroring SOU-32 domain →
 * SOU-33 repo). `CreateGroup` needs only `save`, which the base already provides.
 */
export type GroupRepository = SoftDeletableRepository<GroupId, Group>;
