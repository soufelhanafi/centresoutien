import type { HolidayInput } from '@centresoutien/domain';
import type { HolidayDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `Holiday` as it crosses the IPC boundary. This is
 * the published boundary DTO (`holidayViewSchema` in `shared/ipc/contract`,
 * SOU-30) — the sync envelope stripped and `Date`s serialized, exactly like
 * `RoomView`. `archived` is derived from `deletedAt != null` in main; the
 * renderer never sees the raw entity. Re-aliasing the DTO (rather than
 * re-declaring its fields) keeps the two from drifting.
 */
export type HolidayView = HolidayDto;

/** `fixed` = solar (recurs yearly on the same date); `lunar` = entered per year. */
export type HolidayKind = HolidayView['kind'];

/** The editable fields when creating or editing a holiday. */
export type { HolidayInput };

/** A holiday's lifecycle state; the list is queried one state at a time. */
export type HolidayStatus = 'active' | 'archived';

/** List query parameters. `status` selects the active list or the archived view. */
export type HolidayListFilter = {
  readonly status: HolidayStatus;
};
