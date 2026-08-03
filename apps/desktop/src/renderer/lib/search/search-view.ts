import type { StudentView } from '../students/student-view';
import type { TeacherView } from '../teachers/teacher-view';
import type { ParentView } from '../parents/parent-view';

/** The three people-like entities the global palette searches (SOU-43). */
export type PersonKind = 'student' | 'teacher' | 'parent';

/**
 * One command-palette hit (SOU-43): a person's existing view DTO tagged with its
 * entity kind. Composed from the same {@link StudentView} / {@link TeacherView} /
 * {@link ParentView} the per-entity modules already read, so the palette shares
 * their projection instead of duplicating a shape — it mirrors the domain's
 * published `PersonSearchResult` at the DTO level.
 */
export type PersonSearchResult =
  | { readonly kind: 'student'; readonly entity: StudentView }
  | { readonly kind: 'teacher'; readonly entity: TeacherView }
  | { readonly kind: 'parent'; readonly entity: ParentView };
