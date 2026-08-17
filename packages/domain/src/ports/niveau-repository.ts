import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Niveau, NiveauId } from '../entities/niveau';
import type { CenterCode, EntityId } from '../value-objects/ids';

/** The entity kinds that can reference a Niveau (SOU-260). All three exist:
 *  Students carry `niveauId`, Groups carry `niveauId`, Teachers carry
 *  `niveauIds` (a many-to-many array field). */
export const NIVEAU_USAGE_REFERENCE_KINDS = ['student', 'group', 'teacher'] as const;
export type NiveauUsageReferenceKind = (typeof NIVEAU_USAGE_REFERENCE_KINDS)[number];

/**
 * One entity referencing a Niveau, named for the delete-blocked modal:
 * "impossible de supprimer : utilisé par l'élève Yassine Alaoui". `id` is
 * `EntityId` rather than a specific branded id because it spans several entity
 * kinds (mirrors `SubjectUsageReference`).
 *
 * `label` is bilingual so the FR/AR CRUD modal never needs a second lookup.
 * Students and Teachers carry genuinely distinct `{ fr, ar }` text from their
 * bilingual names; a Group has no name of its own, only a plain `level` string
 * (like `Room.name`, never translated) — for a `'group'` reference the adapter
 * duplicates that string into both `fr` and `ar`, exactly like the subject
 * usage breakdown.
 */
export type NiveauUsageReference = {
  readonly kind: NiveauUsageReferenceKind;
  readonly id: EntityId;
  readonly label: { readonly fr: string; readonly ar: string };
};

/**
 * A niveau paired with its in-use reference count — the read model that backs the
 * manage screen (SOU-260). `inUseCount` is the number of active references to the
 * niveau; `canDelete` is derived (`inUseCount === 0`) so the UI can enable or
 * disable the archive action without a second round-trip. "In use" means active
 * (non-tombstoned) Students / Groups / Teachers referencing the niveau. The
 * mirror invariant is the `ArchiveNiveau` guard: `canDelete === false` is
 * exactly when `NiveauReferencePort.isNiveauInUse` would report `true`.
 *
 * `references` is the named breakdown of what's blocking a delete —
 * `references.length === inUseCount` always, since both count exactly the same
 * live rows. Kept on this same read model (not a separate detail channel) since
 * both are derived from one query in one round-trip.
 */
export type NiveauUsage = {
  readonly niveau: Niveau;
  readonly inUseCount: number;
  readonly canDelete: boolean;
  readonly references: readonly NiveauUsageReference[];
};

/**
 * Persistence port for Niveaux. Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the code-uniqueness lookup `CreateNiveau` and
 * `UpdateNiveau` need. Niveaux are identified by relationships, not people-like
 * matching, so there is no `findByNaturalKey`. Mirrors `SubjectRepository`.
 */
export interface NiveauRepository extends SoftDeletableRepository<NiveauId, Niveau> {
  /**
   * The live (non-tombstoned) niveau in this center whose `code` equals `code`,
   * or null. Backs the per-center code-uniqueness guard in `CreateNiveau` /
   * `UpdateNiveau`. The `code` is already normalized (trimmed + uppercased) by
   * the caller. Center-scoped: never matches another tenant's niveau.
   */
  findByCode(centerCode: CenterCode, code: string): Promise<Niveau | null>;

  /**
   * The center's currently **active** niveaux — the picker set: live
   * (non-tombstoned) rows whose `active` flag is true. Backs `niveau.list`
   * (scope `'active'`), e.g. the student/group/teacher form pickers, which must
   * not offer a deactivated niveau. Center-scoped.
   */
  listActive(centerCode: CenterCode): Promise<readonly Niveau[]>;

  /**
   * **Every** live niveau of the center — active and deactivated alike — with
   * only tombstones excluded. Backs `niveau.list` (scope `'all'`) for
   * name-resolution and the manage screen, which must still resolve a
   * now-inactive niveau a student or group historically references. Center-scoped.
   */
  listAll(centerCode: CenterCode): Promise<readonly Niveau[]>;

  /**
   * Every live niveau of the center paired with its in-use reference count, in a
   * single round-trip. Excludes tombstoned niveaux; the count excludes tombstoned
   * references. Center-scoped: never counts another tenant's references. Backs
   * the manage screen's per-row archive affordance.
   */
  listWithUsage(centerCode: CenterCode): Promise<readonly NiveauUsage[]>;
}
