import type { CenterHoursOverrideInput } from '@centresoutien/domain';
import type { IpcResponse } from '../../../shared/ipc/contract';

/**
 * Presentation types for dated center-hours overrides (SOU-165), tied to the
 * published boundary. The view aliases the `centerHoursOverride.getActive` DTO
 * (`centerHoursOverrideViewSchema` in `shared/ipc/contract`) so the renderer type
 * can never drift from the wire shape, exactly as `HolidayView` aliases its DTO.
 * The editable input is the domain's own `CenterHoursOverrideInput` (the same
 * schema the save channel and the form's zodResolver validate).
 */

/** Presentation projection of a `CenterHoursOverride`: envelope stripped, `archived` derived in main. */
export type CenterHoursOverrideView = NonNullable<
  IpcResponse<'centerHoursOverride.getActive'>['override']
>;

/** One open interval within a day: 24-hour `'HH:mm'` open → close (boundary shape, strings). */
export type TimeWindow = CenterHoursOverrideView['hoursByWeekday'][0][number];

/** Per-weekday open windows, keyed `0..6`. An empty list is a closed day. */
export type HoursByWeekday = CenterHoursOverrideView['hoursByWeekday'];

/** Inclusive `YYYY-MM-DD` date range the override applies to. */
export type OverrideDateRange = CenterHoursOverrideView['dateRange'];

/** The editable fields when saving an override (no id, no envelope). */
export type { CenterHoursOverrideInput };
