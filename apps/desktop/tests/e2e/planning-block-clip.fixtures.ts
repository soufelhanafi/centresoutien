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
 * Black-box fixtures for SOU-134 — the planner session block must NOT clip its
 * 3rd line (`teacher · room`) at the 1-hour row height (HOUR_PX = 56 → a 1h
 * block is 56px tall). Worst case is an exam-prep block (it carries a KindBadge
 * on line 1). Cosmetic-only fix.
 *
 * Everything is driven through the running packaged app and the public preload
 * bridge (`window.api.invoke`): reference data + one weekly session are seeded
 * through the SAME public channels the app uses (`room.create`,
 * `teacher.create`, `subject.create`, `group.create`, `weeklySession.create`).
 * No renderer / domain / data implementation is imported or read — the block
 * geometry is measured live from the rendered DOM.
 */

export { STR, DIRECTION, gotoPlanning, type Locale, type Launched };

export const HOUR_PX = 56;

/** A teacher whose name renders per-locale (fr → nameFr, ar → nameAr). */
export const TEACHER = { nameFr: 'Karim Idrissi', nameAr: 'كريم الإدريسي', phone: '+212611223344' } as const;
export const ROOM = { name: 'Salle A' } as const;
export const SUBJECT = { fr: 'Mathématiques', ar: 'الرياضيات' } as const;

/**
 * Boot fresh (default 09:00–18:00 week, so a 09:00–10:00 session sits at the top
 * of the grid at exactly one row height), seed one room + one teacher + one
 * group of the given kind, then create a 1-hour weekly session bound to all
 * three so the block carries a subject (line 1, + PE badge when exam-prep), a
 * time range (line 2), and `teacher · room` (line 3).
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
 * Locate the 1-hour session block live in the rendered grid and return the
 * measurements that decide "not clipped":
 *   - the block's own `scrollHeight` vs `clientHeight` (overflow ⇒ clipped), and
 *   - the 3rd-line (`teacher · room`) element's bounding box vs the block's box.
 *
 * The block is found black-box: the absolutely-positioned session button one row
 * tall (~56px, the 1h slot) whose text contains the subject, the room and the
 * teacher (either locale spelling). The 3rd line is the deepest descendant that
 * carries the room name (room is Latin, identical in both locales).
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
