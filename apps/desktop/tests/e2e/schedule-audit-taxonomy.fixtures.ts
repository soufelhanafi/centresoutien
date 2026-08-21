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

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/** The new SOU-296 reason labels, in both locales — read off the LIVE audit modal. */
export const TAXONOMY_STR: Record<
  Locale,
  {
    reasonTeacherDoubleBooked: string;
    reasonRoomDoubleBooked: string;
    reasonRoomArchived: string;
    reasonRoomOverCapacity: string;
    softWarning: string;
  }
> = {
  fr: {
    reasonTeacherDoubleBooked: 'Enseignant déjà occupé',
    reasonRoomDoubleBooked: 'Salle déjà occupée',
    reasonRoomArchived: 'Salle archivée',
    reasonRoomOverCapacity: 'Salle en surcapacité',
    softWarning: 'Avertissement',
  },
  ar: {
    reasonTeacherDoubleBooked: 'الأستاذ محجوز مسبقًا',
    reasonRoomDoubleBooked: 'القاعة محجوزة مسبقًا',
    reasonRoomArchived: 'القاعة مؤرشفة',
    reasonRoomOverCapacity: 'القاعة فوق طاقتها',
    softWarning: 'تحذير',
  },
};

/** The next N Mondays strictly after the runtime clock, as `YYYY-MM-DD`. */
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
      const room = (await api.invoke('room.create', { name: 'Salle A', capacity: 20 })) as { id: string };
      const t1 = (await api.invoke('teacher.create', {
        name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
        phone: '+212600000011',
        subjectIds: [],
      })) as { id: string };
      const t2 = (await api.invoke('teacher.create', {
        name: { fr: 'Prof Salma', ar: 'الأستاذة سلمى' },
        phone: '+212600000022',
        subjectIds: [],
      })) as { id: string };
      const s1 = (await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      })) as { id: string };
      const s2 = (await api.invoke('subject.create', {
        name: { fr: 'Physique', ar: 'الفيزياء' },
        code: 'PHYS',
      })) as { id: string };
      const g1 = (await api.invoke('group.create', {
        subjectId: s1.id,
        teacherId: t1.id,
        level: '2 Bac SM',
        capacity: 15,
        kind: 'regular',
      })) as { id: string };
      const g2 = (await api.invoke('group.create', {
        subjectId: s2.id,
        teacherId: t2.id,
        level: '1 Bac SM',
        capacity: 15,
        kind: 'regular',
      })) as { id: string };
      const w1 = (await api.invoke('weeklySession.create', {
        roomId: room.id,
        teacherId: t1.id,
        groupId: g1.id,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
      })) as { id: string };
      const w2 = (await api.invoke('weeklySession.create', {
        roomId: room.id,
        teacherId: t2.id,
        groupId: g2.id,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
        allowScheduleConflict: true,
      })) as { id: string };
      await api.invoke('session.generate', { recurringSessionId: w1.id, from: range.from, to: range.to });
      await api.invoke('session.generate', { recurringSessionId: w2.id, from: range.from, to: range.to });
      return {
        roomId: room.id,
        teacherIds: [t1.id, t2.id],
        wrsIds: [w1.id, w2.id],
        dates: range.dates,
      };
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
      const roomA = (await api.invoke('room.create', { name: 'Salle A', capacity: 20 })) as { id: string };
      const roomB = (await api.invoke('room.create', { name: 'Salle B', capacity: 20 })) as { id: string };
      const teacher = (await api.invoke('teacher.create', {
        name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
        phone: '+212600000011',
        subjectIds: [],
      })) as { id: string };
      const s1 = (await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      })) as { id: string };
      const s2 = (await api.invoke('subject.create', {
        name: { fr: 'Physique', ar: 'الفيزياء' },
        code: 'PHYS',
      })) as { id: string };
      const g1 = (await api.invoke('group.create', {
        subjectId: s1.id,
        teacherId: teacher.id,
        level: '2 Bac SM',
        capacity: 15,
        kind: 'regular',
      })) as { id: string };
      const g2 = (await api.invoke('group.create', {
        subjectId: s2.id,
        teacherId: teacher.id,
        level: '1 Bac SM',
        capacity: 15,
        kind: 'regular',
      })) as { id: string };
      const w1 = (await api.invoke('weeklySession.create', {
        roomId: roomA.id,
        teacherId: teacher.id,
        groupId: g1.id,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
      })) as { id: string };
      const w2 = (await api.invoke('weeklySession.create', {
        roomId: roomB.id,
        teacherId: teacher.id,
        groupId: g2.id,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
        allowScheduleConflict: true,
      })) as { id: string };
      await api.invoke('session.generate', { recurringSessionId: w1.id, from: range.from, to: range.to });
      await api.invoke('session.generate', { recurringSessionId: w2.id, from: range.from, to: range.to });
      return { teacherId: teacher.id, wrsIds: [w1.id, w2.id], dates: range.dates };
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
      const room = (await api.invoke('room.create', { name: 'Salle A', capacity: 20 })) as { id: string };
      const teacher = (await api.invoke('teacher.create', {
        name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
        phone: '+212600000011',
        subjectIds: [],
      })) as { id: string };
      const subject = (await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      })) as { id: string };
      const group = (await api.invoke('group.create', {
        subjectId: subject.id,
        teacherId: teacher.id,
        level: '2 Bac SM',
        capacity: 20,
        kind: 'regular',
      })) as { id: string };
      const wrs = (await api.invoke('weeklySession.create', {
        roomId: room.id,
        teacherId: teacher.id,
        groupId: group.id,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
      })) as { id: string };
      await api.invoke('session.generate', { recurringSessionId: wrs.id, from: range.from, to: range.to });

      const enrolled = 8;
      for (let i = 1; i <= enrolled; i += 1) {
        const student = (await api.invoke('student.create', {
          name: { fr: `Élève ${i}`, ar: `تلميذ ${i}` },
          birthDate: '2010-05-05',
          level: '2 Bac SM',
          school: null,
          notes: null,
          guardianIds: [],
        })) as { id: string };
        await api.invoke('subscription.create', {
          studentId: student.id,
          formulaId: `fml_01HW${String(i).padStart(22, '0')}`,
          kind: 'regular',
          subjectIds: [subject.id],
          startMonth: '2025-09',
          endMonth: null,
        });
        await api.invoke('enrollment.create', {
          studentId: student.id,
          groupId: group.id,
          startMonth: '2026-08',
          endMonth: null,
        });
      }

      await api.invoke('weeklySession.delete', { id: wrs.id });
      await api.invoke('room.update', { id: room.id, name: 'Salle A', capacity: 5 });

      return { roomId: room.id, groupId: group.id, enrolled };
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
      const room = (await api.invoke('room.create', { name: 'Salle A', capacity: 20 })) as { id: string };
      const teacher = (await api.invoke('teacher.create', {
        name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
        phone: '+212600000011',
        subjectIds: [],
      })) as { id: string };
      const subject = (await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      })) as { id: string };
      const group = (await api.invoke('group.create', {
        subjectId: subject.id,
        teacherId: teacher.id,
        level: '2 Bac SM',
        capacity: 15,
        kind: 'regular',
      })) as { id: string };
      const wrs = (await api.invoke('weeklySession.create', {
        roomId: room.id,
        teacherId: teacher.id,
        groupId: group.id,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
      })) as { id: string };
      await api.invoke('session.generate', { recurringSessionId: wrs.id, from: range.from, to: range.to });
      await api.invoke('weeklySession.delete', { id: wrs.id });
      await api.invoke('room.archive', { id: room.id });
      return { roomId: room.id, wrsId: wrs.id };
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
