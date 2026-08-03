import type { Brand } from './brand';

/**
 * A wall-clock time of day in 24-hour `'HH:mm'` form (`'09:00'`, `'18:30'`).
 * Branded so a raw string can't stand in for a validated time. Times are
 * compared as minutes-since-midnight; they carry no date and no timezone —
 * center opening hours are local to the center and never cross midnight.
 */
export type TimeOfDay = Brand<string, 'TimeOfDay'>;

/** Anchored 24-hour `HH:mm`: `00:00`–`23:59`. */
export const TIME_OF_DAY_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTimeOfDay(value: string): boolean {
  return TIME_OF_DAY_REGEX.test(value);
}

/**
 * Minutes since midnight (`'09:00'` → 540). Fixed-offset slicing avoids indexed
 * access under `noUncheckedIndexedAccess`; the value is trusted to be a
 * validated `TimeOfDay`.
 */
export function toMinutes(time: TimeOfDay): number {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  return hours * 60 + minutes;
}

/**
 * The inverse of {@link toMinutes}: minutes-since-midnight back to a zero-padded
 * `'HH:mm'` {@link TimeOfDay} (`540` → `'09:00'`). Used by the session generator
 * to derive a block's `end` from its `start` plus a duration. `totalMinutes`
 * must land inside a single day (`0..1439`); a value that would spill past
 * midnight is a broken config the boundary schema is expected to reject, so it
 * throws rather than silently wrapping or clamping.
 */
export function fromMinutes(totalMinutes: number): TimeOfDay {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes > 1439) {
    throw new RangeError(`Time of day out of range: ${totalMinutes} minutes is not within 00:00–23:59.`);
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` as TimeOfDay;
}
