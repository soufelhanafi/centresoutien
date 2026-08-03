/** An inclusive Monday-to-Sunday `YYYY-MM-DD` range for the schedule export dialog. */
export type WeekRange = {
  readonly start: string;
  readonly end: string;
};

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDateAtLocalMidnight(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** The Monday-to-Sunday range containing `anchorIso` (any date in that week). */
export function weekRangeContaining(anchorIso: string): WeekRange {
  const anchor = parseIsoDateAtLocalMidnight(anchorIso);
  const isoWeekday = anchor.getDay() === 0 ? 7 : anchor.getDay();
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - (isoWeekday - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toIsoDate(monday), end: toIsoDate(sunday) };
}

/** Shifts `anchorIso` by `deltaWeeks` full weeks (negative for previous, positive for next). */
export function shiftWeek(anchorIso: string, deltaWeeks: number): string {
  const anchor = parseIsoDateAtLocalMidnight(anchorIso);
  anchor.setDate(anchor.getDate() + deltaWeeks * 7);
  return toIsoDate(anchor);
}

/** Today as `YYYY-MM-DD`, local time — the export dialog's default week anchor. */
export function todayIso(): string {
  return toIsoDate(new Date());
}
