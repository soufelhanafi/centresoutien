import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Subject, SubjectId } from '../entities/subject';
import type { CenterCode, EntityId } from '../value-objects/ids';

/** The entity kinds that can reference a Subject. Only `'group'` has any live
 *  data today; `'formula'` and `'session'` are named now so the read model and
 *  the CRUD screen's kind switch don't need a breaking change when those
 *  entities grow a `subjectId` (SOU-60 and friends). */
export const SUBJECT_USAGE_REFERENCE_KINDS = ['group', 'formula', 'session'] as const;
export type SubjectUsageReferenceKind = (typeof SUBJECT_USAGE_REFERENCE_KINDS)[number];

/**
 * One entity referencing a Subject, named for the delete-blocked modal (SOU-135):
 * "impossible de supprimer : utilisé par le groupe 3ème A". `id` is `EntityId`
 * rather than a specific branded id because it spans several entity kinds
 * (mirrors `Group.teacherId`'s use of the generic brand for the same reason).
 *
 * `label` is bilingual so the FR/AR CRUD modal never needs a second lookup, but
 * not every referencing entity actually has translated content: a Group has no
 * name of its own, only a plain `level` string (like `Room.name`, never
 * translated) — for a `'group'` reference the adapter duplicates that string
 * into both `fr` and `ar`. A `'formula'` reference (once formulas carry
 * `subjectIds`) can populate genuinely distinct `fr`/`ar` text from
 * `Formula.name`.
 */
export type SubjectUsageReference = {
  readonly kind: SubjectUsageReferenceKind;
  readonly id: EntityId;
  readonly label: { readonly fr: string; readonly ar: string };
};

/**
 * A subject paired with its in-use reference count — the read model that backs the
 * CRUD table (SOU-47). `inUseCount` is the number of active references to the
 * subject; `canDelete` is derived (`inUseCount === 0`) so the UI can enable or
 * disable the archive action without a second round-trip. "In use" today means
 * active (non-tombstoned) groups; sessions and formulas join the count later
 * (they carry no `subjectId` yet). The mirror invariant is the `ArchiveSubject`
 * guard: `canDelete === false` is exactly when `SubjectReferencePort.isSubjectInUse`
 * would report `true`.
 *
 * `references` (SOU-135) is the named breakdown of what's blocking a delete —
 * `references.length === inUseCount` always, since both count exactly the same
 * live rows. Kept on this same read model (not a separate detail channel) since
 * both are derived from one query in one round-trip.
 */
export type SubjectUsage = {
  readonly subject: Subject;
  readonly inUseCount: number;
  readonly canDelete: boolean;
  readonly references: readonly SubjectUsageReference[];
};

/**
 * Persistence port for Subjects. Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the code-uniqueness lookup `CreateSubject`
 * needs. Subjects are identified by relationships, not people-like matching, so
 * there is no `findByNaturalKey`.
 */
export interface SubjectRepository extends SoftDeletableRepository<SubjectId, Subject> {
  /**
   * The live (non-tombstoned) subject in this center whose `code` equals `code`,
   * or null. Backs the per-center code-uniqueness guard in `CreateSubject`. The
   * `code` is already normalized (trimmed + uppercased) by the caller. Center-scoped:
   * never matches another tenant's subject.
   */
  findByCode(centerCode: CenterCode, code: string): Promise<Subject | null>;

  /**
   * The center's currently **active** subjects — the picker set: live
   * (non-tombstoned) rows whose `active` flag is true. Backs `subject.list`
   * (scope `'active'`), e.g. the teacher subject filter and new-formula/group
   * pickers, which must not offer a deactivated subject. Center-scoped.
   */
  listActive(centerCode: CenterCode): Promise<readonly Subject[]>;

  /**
   * **Every** live subject of the center — active and deactivated alike — with
   * only tombstones excluded. Backs `subject.list` (scope `'all'`) for
   * name-resolution and management screens that must still resolve a now-inactive
   * subject a teacher or group historically references. Center-scoped.
   */
  listAll(centerCode: CenterCode): Promise<readonly Subject[]>;

  /**
   * Every live subject of the center paired with its in-use reference count, in a
   * single round-trip. Excludes tombstoned subjects; the count excludes tombstoned
   * references. Center-scoped: never counts another tenant's references. Backs the
   * SOU-47 CRUD table's per-row archive affordance.
   */
  listWithUsage(centerCode: CenterCode): Promise<readonly SubjectUsage[]>;
}
