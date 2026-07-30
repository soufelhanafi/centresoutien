import type { StudentInput } from '@centresoutien/domain';
import type { StudentDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `Student` as it crosses the IPC boundary — the
 * sync envelope (version, deviceOrigin, updatedBy…) is stripped and `Date`s are
 * serialized to strings, exactly like `centerDto` (SOU-28). The renderer never
 * handles the raw domain entity.
 *
 * This is a direct alias of the boundary's `studentViewSchema` (the single
 * source of truth in `shared/ipc/contract`), so the renderer shape can never
 * drift from what the `student.list` / `student.get` channels actually return.
 */
export type StudentView = StudentDto;

/** The editable fields when creating or editing a student — the domain's own schema. */
export type { StudentInput };

/** List query parameters. `search` matches the FR/AR name or the level. */
export type StudentListFilter = {
  readonly search: string;
};
