import type { GroupKind } from '@centresoutien/domain';

/** A bilingual `{ fr, ar }` label shared by teacher/subject options. */
export type LocalizedName = { readonly fr: string; readonly ar: string };

/** A room the session can occupy — the picker option (room names are not bilingual). */
export type SessionRoomOption = { readonly id: string; readonly name: string };

/**
 * A teacher who can staff the session — optional assignment. `subjectIds` are the
 * subjects the teacher is qualified for, driving the subject-aware group filter
 * (SOU-277). An empty list means "unclassified": such a teacher matches no
 * subject-bearing group and is hidden once a group is selected.
 */
export type SessionTeacherOption = {
  readonly id: string;
  readonly name: LocalizedName;
  readonly subjectIds: readonly string[];
};

/**
 * A group the session can belong to — optional. The group owns the session's
 * subject and `kind`, so the picker labels each option by its subject + level and
 * badges exam-prep, matching the grid's visual language. `subjectId` is the raw
 * subject link used by the subject-aware teacher filter (SOU-277); `subjectName`
 * stays a nullable display-only label.
 */
export type SessionGroupOption = {
  readonly id: string;
  readonly subjectId: string;
  readonly subjectName: LocalizedName | null;
  readonly level: string | null;
  readonly kind: GroupKind;
};

/**
 * The option lists the create/edit session form needs for its room / teacher /
 * group pickers. Loaded once through {@link useSessionFormOptions} so the form
 * never talks to `window.api` directly.
 */
export type SessionFormOptions = {
  readonly rooms: readonly SessionRoomOption[];
  readonly teachers: readonly SessionTeacherOption[];
  readonly groups: readonly SessionGroupOption[];
};
