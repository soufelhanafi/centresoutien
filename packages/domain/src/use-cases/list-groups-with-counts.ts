import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { ListGroups, ListGroupsInput } from './list-groups';
import type { Group } from '../entities/group';

/** A group plus its live active-enrollment count, for the list's fill % (SOU-127). */
export type GroupWithCount = {
  group: Group;
  /** Live (non-tombstoned) enrollments in the group — the numerator of fill %. */
  enrolledCount: number;
};

/**
 * The group list enriched with each group's live enrollment count, so the list
 * screen can render **fill %** = `enrolledCount / capacity` without one IPC call
 * per row. It delegates the gate (`core.groups`), scope selection, and ordering to
 * {@link ListGroups} — reusing that use case rather than re-deriving it, the same
 * way `AttemptLogin` composes `VerifyAdminPassword` — then resolves all counts in a
 * **single** batch read (`countActiveByGroups`), never an N+1. A group with no live
 * enrollment is absent from the batch map and defaults to 0.
 *
 * Center scoping is inherited from `ListGroups`: only this center's group ids are
 * ever passed to the count read, so the counts can never span tenants.
 */
export class ListGroupsWithCounts {
  constructor(
    private readonly listGroups: ListGroups,
    private readonly enrollments: EnrollmentRepository,
  ) {}

  async execute(input: ListGroupsInput): Promise<readonly GroupWithCount[]> {
    const groups = await this.listGroups.execute(input);
    const counts = await this.enrollments.countActiveByGroups(groups.map((group) => group.id));
    return groups.map((group) => ({ group, enrolledCount: counts.get(group.id) ?? 0 }));
  }
}
