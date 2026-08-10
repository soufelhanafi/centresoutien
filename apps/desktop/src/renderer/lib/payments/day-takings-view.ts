import type { DayTakingsDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a day's SQL-netted cash-desk takings (SOU-198). A
 * direct alias of the boundary's `dayTakingsSchema` (the single source of truth
 * in `shared/ipc/contract`), so the renderer shape can never drift from what the
 * `payment.takings` channel returns. `netMad` is already netted (payments −
 * reversals) in SQL, cap-independent, and can be negative on a reversal-heavy day.
 */
export type DayTakingsView = DayTakingsDto;
