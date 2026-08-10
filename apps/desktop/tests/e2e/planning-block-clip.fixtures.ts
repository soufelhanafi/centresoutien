import { type Page } from '@playwright/test';
import {
  boot,
  createSessionViaBridge,
  gotoPlanning,
  STR,
  DIRECTION,
  type Locale,
  type Launched,
  type Seeded,
} from './planning-sessions.fixtures';

/**
 * Black-box fixtures for SOU-134. Boot the packaged app, seed reference data +
 * one weekly session through the public preload bridge only, then measure the
 * rendered block geometry live. exam-prep is the worst case (KindBadge on line 1).
 */

export { STR, DIRECTION, gotoPlanning, type Locale, type Launched };

export const HOUR_PX = 56;

/** A teacher whose name renders per-locale (fr → nameFr, ar → nameAr). */
export const TEACHER = { nameFr: 'Karim Idrissi', nameAr: 'كريم الإدريسي', phone: '+212611223344' } as const;
export const ROOM = { name: 'Salle A' } as const;
export const SUBJECT = { fr: 'Mathématiques', ar: 'الرياضيات' } as const;

/**
 * 09:00–10:00 sits at the top of the default 09:00–18:00 grid at exactly one row
 * height (HOUR_PX), i.e. the smallest slot — the case that clips. Seeds one room,
 * teacher and group of `kind`, then a 1h weekly session bound to all three.
 */
export async function bootWithOneHourSession(
  locale: Locale,
  kind: 'regular' | 'exam-prep',
): Promise<Launched & { seeded: Seeded }> {
  const live = await boot(
    locale,
    {
      rooms: [ROOM],
      teachers: [TEACHER],
      groups: [{ level: '2 Bac SM', kind }],
    },
    'premium',
  );

  const room = live.seeded.rooms[0];
  const teacher = live.seeded.teachers[0];
  const group = live.seeded.groups[0];
  if (!room || !teacher || !group) throw new Error('seed incomplete');

  await createSessionViaBridge(live.win, {
    roomId: room.id,
    teacherId: teacher.id,
    groupId: group.id,
    dayOfWeek: 1,
    start: '09:00',
    end: '10:00',
  });

  return live;
}

export type BlockMetrics = {
  found: boolean;
  height: number;
  clientHeight: number;
  scrollHeight: number;
  blockRect: { top: number; bottom: number; left: number; right: number };
  metaFound: boolean;
  metaRect: { top: number; bottom: number; left: number; right: number };
  metaText: string;
};

/**
 * Find the 1h block black-box — the absolutely-positioned ~56px button carrying
 * subject + room + teacher (either locale spelling) — and measure overflow
 * (scrollHeight vs clientHeight) plus the 3rd-line box vs the block box. The 3rd
 * line is the deepest descendant holding the room name (Latin, identical in both
 * locales).
 */
export async function measureBlock(
  win: Page,
  args: { subject: string; teacherFr: string; teacherAr: string; room: string },
): Promise<BlockMetrics> {
  return win.evaluate((a) => {
    const empty = { top: 0, bottom: 0, left: 0, right: 0 };
    const hasAll = (t: string) =>
      t.includes(a.subject) && t.includes(a.room) && (t.includes(a.teacherFr) || t.includes(a.teacherAr));

    const candidates = Array.from(document.querySelectorAll<HTMLElement>('button')).filter((el) => {
      if (getComputedStyle(el).position !== 'absolute') return false;
      const h = el.getBoundingClientRect().height;
      if (h < 40 || h > 80) return false;
      return hasAll(el.textContent ?? '');
    });

    const block = candidates[0];
    if (!block) {
      return {
        found: false,
        height: 0,
        clientHeight: 0,
        scrollHeight: 0,
        blockRect: empty,
        metaFound: false,
        metaRect: empty,
        metaText: '',
      };
    }

    const deepestWithRoom = Array.from(block.querySelectorAll<HTMLElement>('*'))
      .filter((el) => (el.textContent ?? '').includes(a.room))
      .filter((el) => !Array.from(el.children).some((c) => (c.textContent ?? '').includes(a.room)));
    const meta = deepestWithRoom[deepestWithRoom.length - 1] ?? null;

    const br = block.getBoundingClientRect();
    const mr = meta?.getBoundingClientRect();

    return {
      found: true,
      height: Math.round(br.height),
      clientHeight: block.clientHeight,
      scrollHeight: block.scrollHeight,
      blockRect: { top: br.top, bottom: br.bottom, left: br.left, right: br.right },
      metaFound: Boolean(meta),
      metaRect: mr
        ? { top: mr.top, bottom: mr.bottom, left: mr.left, right: mr.right }
        : empty,
      metaText: meta?.textContent ?? '',
    };
  }, args);
}
