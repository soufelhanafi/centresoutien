import type { ParentInput } from '@centresoutien/domain';
import type { ParentDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `Parent`/guardian as it crosses the IPC boundary —
 * the sync envelope (version, deviceOrigin, updatedBy…) is stripped and `Date`s
 * are serialized to strings, exactly like {@link StudentView}. The renderer never
 * handles the raw domain entity.
 *
 * A direct alias of the boundary's `parentViewSchema` (the single source of truth
 * in `shared/ipc/contract`), so the renderer shape can never drift from what the
 * `parent.list` / `parent.get` channels actually return.
 */
export type ParentView = ParentDto;

/** The editable fields when creating or editing a parent — the domain's own schema. */
export type { ParentInput };

/** List query parameters. `search` matches the name or the phone number. */
export type ParentListFilter = {
  readonly search: string;
};
