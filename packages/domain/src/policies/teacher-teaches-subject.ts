import type { SubjectId } from '../entities/subject';
import type { Teacher } from '../entities/teacher';

/**
 * A teacher may staff a session only for a subject they actually teach
 * (CLAUDE.md §7; SOU-52 "teacher must teach the subject"). Pure predicate over
 * plain inputs — `teacher.subjectIds` must contain the session's subject. The
 * group owns a session's subject, so the caller passes `group.subjectId`.
 *
 * Returns a boolean, not an error: this is the check, not the write path. The
 * SOU-131 create/edit use case loads the teacher and the group, calls this, and
 * throws when it is `false`; a session with no teacher assigned skips the check
 * entirely (no teacher, no subject to validate). Reads only `subjectIds`, so it
 * takes a `Pick` rather than a whole `Teacher` — callers can pass either.
 */
export function teacherTeachesSubject(
  teacher: Pick<Teacher, 'subjectIds'>,
  subjectId: SubjectId,
): boolean {
  return teacher.subjectIds.includes(subjectId);
}
