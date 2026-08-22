import type { Page } from '@playwright/test';
import { nextMondayStrictlyAfter, isoLocalDate, type Locale } from './schedule-audit.dates';

/**
 * Black-box seeding fixtures for SOU-296 — the standing "Audit du planning" full
 * conflict taxonomy (room/teacher double-book, room-archived, room-over-capacity)
 * plus the SOU-262 dedup collapse. Reuses the SOU-201 harness (launch / gotoAudit /
 * auditRows / STR / DATE / MONDAYS) from `schedule-audit.fixtures` — no renderer /
 * domain / data implementation is imported, and every entity is created through the
 * SAME public preload bridge (`window.api.invoke`) the UI itself uses.
 *
 * Every reason label below is the user-facing contract mirrored from the running
 * i18n catalog (`scheduleAudit.reason.*`), discovered by reading the LIVE app —
 * never from source.
 */

// The preload bridge isn't in Playwright's DOM typings, so `window.api` is read
// through a single narrow `unknown`-to-`Bridge` cast per evaluate. `invoke` is
// typed `Promise<unknown>`, so each seeding call narrows its result to the
// minimal `{ id }` shape it needs via the one `idOf` helper defined inside the
// evaluate — the ONLY `unknown`→concrete cast in the file, deliberately not
// validated against the app's zod schemas (test-only), mirroring the SOU-201
// `schedule-audit.fixtures` harness.
type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/** The new SOU-296 reason labels, in both locales — read off the LIVE audit modal. */
export const TAXONOMY_STR: Record<
  Locale,
  {
    reasonTeacherDoubleBooked: string;
    reasonRoomDoubleBooked: string;
    reasonRoomArchived: string;
    reasonRoomOverCapacity: string;
  }
> = {
  fr: {
    reasonTeacherDoubleBooked: 'Enseignant déjà occupé',
    reasonRoomDoubleBooked: 'Salle déjà occupée',
    reasonRoomArchived: 'Salle archivée',
    reasonRoomOverCapacity: 'Salle en surcapacité',
  },
  ar: {
    reasonTeacherDoubleBooked: 'الأستاذ محجوز مسبقًا',
    reasonRoomDoubleBooked: 'القاعة محجوزة مسبقًا',
    reasonRoomArchived: 'القاعة مؤرشفة',
    reasonRoomOverCapacity: 'القاعة فوق طاقتها',
  },
};

/**
 * The next N Mondays strictly after the runtime clock, as `YYYY-MM-DD`. Mirrors
 * the SOU-201 harness's runtime-derived date convention (the `MONDAYS` export in
 * `schedule-audit.dates.ts`): dates are intentionally derived from the injected
 * runtime clock so a materialized window is always strictly in the future, never
 * a hardcoded date that goes stale.
 */
export function futureMondays(count: number): { from: string; to: string; dates: string[] } {
  const first = nextMondayStrictlyAfter(new Date());
  const dates: string[] = [];
  for (let i = 0; i < count; i += 1) {
    dates.push(isoLocalDate(new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7 * i)));
  }
  return { from: dates[0]!, to: dates[dates.length - 1]!, dates };
}

export type SeededDoubleBook = { roomId: string; teacherIds: string[]; wrsIds: string[]; dates: string[] };

/**
 * S1 — force a room double-book: two weekly recurring series in the SAME room,
 * same Monday 15:00–17:00, DIFFERENT teachers (so only `room-double-booked`
 * fires, not the teacher check), materialized across `weeks` Mondays. The second
 * template is committed with `allowScheduleConflict` — the same force path a
 * user's "Programmer quand même" click triggers (SOU-189).
 */
export async function seedRoomDoubleBook(win: Page, weeks = 8): Promise<SeededDoubleBook> {
  const { from, to, dates } = futureMondays(weeks);
  return win.evaluate(
    async (range) => {
      const api = (window as unknown as { api: Bridge }).api;
      const idOf = (result: unknown): string => (result as { id: string }).id;
      const roomId = idOf(await api.invoke('room.create', { name: 'Salle A', capacity: 20 }));
      const t1 = idOf(await api.invoke('teacher.create', {
        name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
        phone: '+212600000011',
        subjectIds: [],
      }));
      const t2 = idOf(await api.invoke('teacher.create', {
        name: { fr: 'Prof Salma', ar: 'الأستاذة سلمى' },
        phone: '+212600000022',
        subjectIds: [],
      }));
      const s1 = idOf(await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      }));
      const s2 = idOf(await api.invoke('subject.create', {
        name: { fr: 'Physique', ar: 'الفيزياء' },
        code: 'PHYS',
      }));
      const g1 = idOf(await api.invoke('group.create', {
        subjectId: s1,
        teacherId: t1,
        level: '2 Bac SM',
        capacity: 15,
        kind: 'regular',
      }));
      const g2 = idOf(await api.invoke('group.create', {
        subjectId: s2,
        teacherId: t2,
        level: '1 Bac SM',
        capacity: 15,
        kind: 'regular',
      }));
      const w1 = idOf(await api.invoke('weeklySession.create', {
        roomId,
        teacherId: t1,
        groupId: g1,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
      }));
      const w2 = idOf(await api.invoke('weeklySession.create', {
        roomId,
        teacherId: t2,
        groupId: g2,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
        allowScheduleConflict: true,
      }));
      await api.invoke('session.generate', { recurringSessionId: w1, from: range.from, to: range.to });
      await api.invoke('session.generate', { recurringSessionId: w2, from: range.from, to: range.to });
      return { roomId, teacherIds: [t1, t2], wrsIds: [w1, w2], dates: range.dates };
    },
    { from, to, dates },
  );
}

export type SeededTeacherDoubleBook = { teacherId: string; wrsIds: string[]; dates: string[] };

/**
 * S1b — force a teacher double-book: the SAME teacher in TWO different rooms at
 * the same Monday 15:00–17:00 (so only `teacher-double-booked` fires, not the
 * room check), materialized across `weeks` Mondays.
 */
export async function seedTeacherDoubleBook(win: Page, weeks = 8): Promise<SeededTeacherDoubleBook> {
  const { from, to, dates } = futureMondays(weeks);
  return win.evaluate(
    async (range) => {
      const api = (window as unknown as { api: Bridge }).api;
      const idOf = (result: unknown): string => (result as { id: string }).id;
      const roomA = idOf(await api.invoke('room.create', { name: 'Salle A', capacity: 20 }));
      const roomB = idOf(await api.invoke('room.create', { name: 'Salle B', capacity: 20 }));
      const teacher = idOf(await api.invoke('teacher.create', {
        name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
        phone: '+212600000011',
        subjectIds: [],
      }));
      const s1 = idOf(await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      }));
      const s2 = idOf(await api.invoke('subject.create', {
        name: { fr: 'Physique', ar: 'الفيزياء' },
        code: 'PHYS',
      }));
      const g1 = idOf(await api.invoke('group.create', {
        subjectId: s1,
        teacherId: teacher,
        level: '2 Bac SM',
        capacity: 15,
        kind: 'regular',
      }));
      const g2 = idOf(await api.invoke('group.create', {
        subjectId: s2,
        teacherId: teacher,
        level: '1 Bac SM',
        capacity: 15,
        kind: 'regular',
      }));
      const w1 = idOf(await api.invoke('weeklySession.create', {
        roomId: roomA,
        teacherId: teacher,
        groupId: g1,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
      }));
      const w2 = idOf(await api.invoke('weeklySession.create', {
        roomId: roomB,
        teacherId: teacher,
        groupId: g2,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
        allowScheduleConflict: true,
      }));
      await api.invoke('session.generate', { recurringSessionId: w1, from: range.from, to: range.to });
      await api.invoke('session.generate', { recurringSessionId: w2, from: range.from, to: range.to });
      return { teacherId: teacher, wrsIds: [w1, w2], dates: range.dates };
    },
    { from, to, dates },
  );
}

export type SeededOverCapacity = { roomId: string; groupId: string; enrolled: number };

/**
 * S2 — a group whose LIVE active enrollment exceeds its session room's capacity.
 * Seat-fit (group.capacity ≤ room.capacity) is enforced on every bind, so the
 * overflow is produced the way a real center hits it: schedule the group in a
 * 20-seat room, enroll 8 students, unschedule the weekly block (the already-
 * generated dates stay), then shrink the room to 5 — the shrink is unguarded once
 * no active weekly session references it. The standing audit then flags the live
 * dated sessions: 8 enrolled > 5 seats → `room-over-capacity` (soft warning).
 */
export async function seedOverCapacity(win: Page): Promise<SeededOverCapacity> {
  const { from, to } = futureMondays(2);
  return win.evaluate(
    async (range) => {
      const api = (window as unknown as { api: Bridge }).api;
      const idOf = (result: unknown): string => (result as { id: string }).id;
      const roomId = idOf(await api.invoke('room.create', { name: 'Salle A', capacity: 20 }));
      const teacherId = idOf(await api.invoke('teacher.create', {
        name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
        phone: '+212600000011',
        subjectIds: [],
      }));
      const subjectId = idOf(await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      }));
      const groupId = idOf(await api.invoke('group.create', {
        subjectId,
        teacherId,
        level: '2 Bac SM',
        capacity: 20,
        kind: 'regular',
      }));
      const wrs = idOf(await api.invoke('weeklySession.create', {
        roomId,
        teacherId,
        groupId,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
      }));
      await api.invoke('session.generate', { recurringSessionId: wrs, from: range.from, to: range.to });

      const enrolled = 8;
      for (let i = 1; i <= enrolled; i += 1) {
        const studentId = idOf(await api.invoke('student.create', {
          name: { fr: `Élève ${i}`, ar: `تلميذ ${i}` },
          birthDate: '2010-05-05',
          level: '2 Bac SM',
          school: null,
          notes: null,
          guardianIds: [],
        }));
        await api.invoke('subscription.create', {
          studentId,
          formulaId: `fml_01HW${String(i).padStart(22, '0')}`,
          kind: 'regular',
          subjectIds: [subjectId],
          startMonth: '2025-09',
          endMonth: null,
        });
        await api.invoke('enrollment.create', {
          studentId,
          groupId,
          startMonth: '2026-08',
          endMonth: null,
        });
      }

      await api.invoke('weeklySession.delete', { id: wrs });
      await api.invoke('room.update', { id: roomId, name: 'Salle A', capacity: 5 });

      return { roomId, groupId, enrolled };
    },
    { from, to },
  );
}

export type SeededArchivedRoom = { roomId: string; wrsId: string };

/**
 * S3 — archive a room that still has dated sessions. `room.archive` is blocked
 * while an active weekly session references the room, so the weekly block is
 * unscheduled first (its already-generated dates survive); the room is then
 * archived, stranding every live occurrence with `room-archived`.
 */
export async function seedArchivedRoom(win: Page): Promise<SeededArchivedRoom> {
  const { from, to } = futureMondays(2);
  return win.evaluate(
    async (range) => {
      const api = (window as unknown as { api: Bridge }).api;
      const idOf = (result: unknown): string => (result as { id: string }).id;
      const roomId = idOf(await api.invoke('room.create', { name: 'Salle A', capacity: 20 }));
      const teacherId = idOf(await api.invoke('teacher.create', {
        name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
        phone: '+212600000011',
        subjectIds: [],
      }));
      const subjectId = idOf(await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      }));
      const groupId = idOf(await api.invoke('group.create', {
        subjectId,
        teacherId,
        level: '2 Bac SM',
        capacity: 15,
        kind: 'regular',
      }));
      const wrsId = idOf(await api.invoke('weeklySession.create', {
        roomId,
        teacherId,
        groupId,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
      }));
      await api.invoke('session.generate', { recurringSessionId: wrsId, from: range.from, to: range.to });
      await api.invoke('weeklySession.delete', { id: wrsId });
      await api.invoke('room.archive', { id: roomId });
      return { roomId, wrsId };
    },
    { from, to },
  );
}

/** Restore an archived room (S3 recompute-on-open proof). */
export async function restoreRoom(win: Page, roomId: string): Promise<void> {
  await win.evaluate(async (id) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('room.restore', { id });
  }, roomId);
}
