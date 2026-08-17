import type { GroupInput, GroupKind } from '@centresoutien/domain';
import type { GroupDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `Group` as it crosses the IPC boundary — the sync
 * envelope is stripped and `Date`s serialized, exactly like `RoomView`. A direct
 * alias of the boundary's `groupViewSchema` (the single source of truth in
 * `shared/ipc/contract`), so the renderer shape can never drift from what the
 * `group.*` channels return. The raw view carries ids only; the enriched
 * {@link GroupRow} adds the resolved subject/teacher names + fill count.
 */
export type GroupView = GroupDto;

/** The editable fields when creating or editing a group — the domain's own schema. */
export type { GroupInput, GroupKind };

/** A group's lifecycle state; the list is queried one state at a time. */
export type GroupStatus = 'active' | 'archived';

/** A bilingual name shared by subjects, teachers, and students. */
export type LocalizedName = { readonly fr: string; readonly ar: string };

/** A subject the group teaches — the picker option and name source. */
export type SubjectOption = { readonly id: string; readonly name: LocalizedName };

/** A teacher who may staff the group — the picker option and name source. */
export type TeacherOption = { readonly id: string; readonly name: LocalizedName };

/** A student who may be enrolled — the add-student picker option. */
export type StudentOption = {
  readonly id: string;
  readonly name: LocalizedName;
  readonly level: string;
};

/**
 * The option lists the create/edit form needs to render its subject / teacher
 * pickers. Loaded once through the gateway so the form never talks to
 * `window.api` directly.
 */
export type GroupFormOptions = {
  readonly subjects: readonly SubjectOption[];
  readonly teachers: readonly TeacherOption[];
};

/**
 * A group enriched for display: the raw {@link GroupView} joined with the
 * resolved subject / teacher names and the live `enrolledCount` used to derive
 * the fill %. This is the shape the list and detail render. The real enrichment
 * (names + count) is the SOU-127 read model; until it lands the gateway serves
 * it from the mock.
 */
export type GroupRow = {
  readonly id: string;
  readonly subjectId: string;
  readonly subjectName: LocalizedName;
  readonly teacherId: string | null;
  readonly teacherName: LocalizedName | null;
  readonly level: string;
  readonly niveauId: string | null;
  readonly capacity: number;
  readonly kind: GroupKind;
  readonly enrolledCount: number;
  readonly archived: boolean;
};

/** One enrolled student shown in a group's roster (SOU-127 read model, mocked). */
export type RosterEntry = {
  readonly enrollmentId: string;
  readonly studentId: string;
  readonly studentName: LocalizedName;
  readonly level: string;
};
