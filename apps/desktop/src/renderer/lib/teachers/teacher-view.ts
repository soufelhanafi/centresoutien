import type { TeacherInput } from '@centresoutien/domain';
import type { TeacherDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `Teacher` as it crosses the IPC boundary — the
 * sync envelope (version, deviceOrigin, updatedBy…) is stripped and `Date`s are
 * serialized to strings, exactly like `StudentView` (SOU-39). The renderer never
 * handles the raw domain entity.
 *
 * This is a direct alias of the boundary's `teacherViewSchema` (the single source
 * of truth in `shared/ipc/contract`), so the renderer shape can never drift from
 * what the `teacher.list` / `teacher.get` channels actually return.
 */
export type TeacherView = TeacherDto;

/** The editable fields when creating or editing a teacher — the domain's own schema. */
export type { TeacherInput };

/** List query parameters. `search` matches the FR/AR name or the phone number. */
export type TeacherListFilter = {
  readonly search: string;
};
