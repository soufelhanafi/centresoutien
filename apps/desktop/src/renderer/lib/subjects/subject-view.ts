import type { SubjectInput, SubjectUpdateInput } from '@centresoutien/domain';
import type { SubjectDto, SubjectUsageDto } from '../../../shared/ipc/contract';

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

/**
 * A subject paired with its in-use reference count and named breakdown, as
 * returned by `subject.listWithUsage` (SOU-47 / SOU-135). A direct alias of the
 * boundary's `subjectUsageViewSchema` so the CRUD table's shape can never drift
 * from what the channel actually returns.
 */
export type SubjectUsageView = SubjectUsageDto;

/**
 * A subject's lifecycle state for the CRUD table's tabs — driven by the domain's
 * `active` flag, NOT the soft-delete tombstone (a deactivated subject is still a
 * live row, just hidden from new-formula/group pickers). Both tabs are populated
 * from the same `listWithUsage` read in one round-trip and split client-side.
 */
export type SubjectStatus = 'active' | 'inactive';

/** The editable fields when creating a subject — the domain's own schema. */
export type { SubjectInput };

/** The editable fields when renaming / toggling a subject — the domain's own schema. */
export type { SubjectUpdateInput };
