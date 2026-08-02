import type { FormulaDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `Formula` as it crosses the IPC boundary (SOU-65)
 * — the sync envelope and `isImmutable` are stripped in main, exactly like
 * `SubjectView`. A direct alias of the boundary's `formulaViewSchema` (the
 * single source of truth in `shared/ipc/contract`), so the renderer shape can
 * never drift from what `formula.list` actually returns.
 */
export type FormulaView = FormulaDto;
