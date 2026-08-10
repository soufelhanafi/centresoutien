import type { WeekdayIndex } from '@centresoutien/domain';

/**
 * Presentation types for dated center-hours overrides (SOU-165).
 *
 * ## Contract status (frontend ↔ domain)
 *
 * The domain publishes `TimeWindow`, `CenterHoursOverride`, and its save/get-active
 * use cases in parallel; until the "[PUBLISHED] domain contract" note lands these
 * mirror the agreed shapes so the UI runs end-to-end against
 * {@link ../center-hours-overrides/overrides-gateway.CenterHoursOverridesGateway}.
 * When the domain types ship, re-alias these to the published boundary DTOs (as
 * `HolidayView` aliases `HolidayDto`) rather than re-declaring the fields, so the
 * two never drift.
 */

/** One open interval within a day: 24-hour `'HH:mm'` open → close. */
export type TimeWindow = {
  readonly open: string;
  readonly close: string;
};

/**
 * Per-weekday open windows. An empty array means the day is closed for the whole
 * override period. Windows are ordered by `open` and never overlap — the schema
 * enforces both, mirroring the domain rule.
 */
export type HoursByWeekday = Readonly<Record<WeekdayIndex, readonly TimeWindow[]>>;

/** Inclusive `YYYY-MM-DD` date range the override applies to. */
export type OverrideDateRange = {
  readonly start: string;
  readonly end: string;
};

/** Presentation projection of a `CenterHoursOverride`, envelope stripped. */
export type CenterHoursOverrideView = {
  readonly id: string;
  readonly dateRange: OverrideDateRange;
  readonly hoursByWeekday: HoursByWeekday;
  readonly createdAt: string;
};

/** The editable fields when saving an override (no id, no envelope). */
export type CenterHoursOverrideInput = {
  readonly dateRange: OverrideDateRange;
  readonly hoursByWeekday: HoursByWeekday;
};
