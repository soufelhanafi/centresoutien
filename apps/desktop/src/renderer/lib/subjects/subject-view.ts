import type { SubjectDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `Subject` as it crosses the IPC boundary (SOU-124)
 * — the sync envelope (version, deviceOrigin, updatedBy…) and `Date`s are stripped
 * in main, exactly like `TeacherView`. The renderer never handles the raw entity.
 *
 * A direct alias of the boundary's `subjectViewSchema` (the single source of truth
 * in `shared/ipc/contract`), so the renderer shape can never drift from what the
 * `subject.list` / `subject.get` channels return.
 */
export type SubjectView = SubjectDto;

/**
 * Read scope for the subject list channel: `active` selects the picker set (the
 * live subjects a director can still assign), `all` returns every non-tombstoned
 * subject including deactivated ones — needed to resolve names for links already
 * held by a teacher.
 */
export type SubjectScope = 'active' | 'all';
