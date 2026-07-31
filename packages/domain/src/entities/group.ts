import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { EntityId } from '../value-objects/ids';
import type { SubjectId } from './subject';
import type { RoomId } from './room';

/** ULID id prefix for groups: `grp_01HW…`. */
export const GROUP_ID_PREFIX = 'grp';

export type GroupId = Brand<string, 'GroupId'>;

/** A group teaches exactly one subject in one track; exam-prep never mixes with regular. */
export const GROUP_KINDS = ['regular', 'exam-prep'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

/**
 * A class the center runs: one `subjectId` taught in one `roomId`, optionally
 * staffed by a teacher, for students of a given `level`, capped at `capacity`
 * seats. `kind` splits the regular track from the exam-prep track (CLAUDE.md §7);
 * exam-prep is Pro+ and the `CreateGroup` use case gates it — an Essentiel center
 * only ever holds `kind: 'regular'` groups. The group is where students learn;
 * what they pay for is the Formula. Groups never appear on an invoice.
 *
 * `teacherId` is nullable and typed `EntityId` rather than a `TeacherId` because
 * the Teacher entity is still in flight (SOU-36) — it mirrors
 * {@link WeeklyRecurringSession}, whose `teacherId` is likewise the generic id. A
 * group may exist before a teacher is assigned; strengthen the brand and add the
 * FK when the Teacher entity lands.
 *
 * `capacity` is the seat ceiling (always ≥ 1, enforced by `groupInputSchema`) and
 * must not exceed the room's own capacity — the `CreateGroup` use case rejects
 * that with `GroupOverCapacityError`. The concrete enrollment-count enforcement
 * (blocking the Nth student) lands with the Enrollment entity; this entity only
 * defines the ceiling and the typed error.
 *
 * Not people-like, so it carries no `naturalKey` — a group is identified by its
 * relationships (subject + room + teacher + level), not by a matching key.
 * Soft-delete only: archiving sets `deletedAt`; a tombstoned row still syncs.
 * `active` mirrors `Subject.active` — a future "temporarily paused" toggle, set
 * `true` on creation and not yet read by any policy; the live/archived lifecycle
 * is driven by the envelope `deletedAt`, never by this flag.
 */
export type Group = EntityEnvelope & {
  readonly id: GroupId;
  subjectId: SubjectId;
  teacherId: EntityId | null;
  roomId: RoomId;
  level: string;
  capacity: number;
  kind: GroupKind;
  active: boolean;
};
