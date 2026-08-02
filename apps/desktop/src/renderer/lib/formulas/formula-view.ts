import type { FormulaInput } from '@centresoutien/domain';
import type { FormulaDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `Formula` as it crosses the IPC boundary (SOU-62)
 * — the sync envelope (version, deviceOrigin, updatedBy…) and `Date`s are
 * stripped in main, exactly like `SubjectView`. The renderer never handles the
 * raw entity.
 *
 * A direct alias of the boundary's `formulaViewSchema` (the single source of
 * truth in `shared/ipc/contract`), so the renderer shape can never drift from
 * what the `formula.list` / `formula.get` channels return.
 */
export type FormulaView = FormulaDto;

/**
 * Read scope for the formula list channel: `active` selects the new-subscription
 * picker set, `all` returns every live formula including deactivated ones —
 * needed by the SOU-62 CRUD table. Mirrors `SubjectScope`.
 */
export type FormulaScope = 'active' | 'all';

/**
 * A formula's lifecycle state for the CRUD table's tabs — driven by the
 * domain's `active` flag, NOT the soft-delete tombstone (there is none: a
 * deactivated formula is still a live row, just hidden from new-subscription
 * pickers). Both tabs are populated from the same `formula.list` read (scope
 * `all`) in one round-trip and split client-side. Mirrors `SubjectStatus`.
 */
export type FormulaStatus = 'active' | 'inactive';

/** The editable fields when creating or editing a formula — the domain's own schema. */
export type { FormulaInput };
