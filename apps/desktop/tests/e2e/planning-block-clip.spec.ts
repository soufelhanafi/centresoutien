import { test, expect } from '@playwright/test';
import {
  STR,
  DIRECTION,
  HOUR_PX,
  ROOM,
  TEACHER,
  SUBJECT,
  bootWithOneHourSession,
  measureBlock,
  gotoPlanning,
  type Launched,
  type Locale,
} from './planning-block-clip.fixtures';

/**
 * SOU-134 — a 1h planner block (HOUR_PX = 56, the smallest slot) must not clip
 * its 3rd line (`teacher · room`). exam-prep is the worst case: its KindBadge
 * grows line 1. Checked in FR-LTR and AR-RTL. Two independent overflow checks
 * live on the block: scrollHeight <= clientHeight, and the 3rd-line box sits
 * within the block box.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { seeded: unknown }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

for (const kind of ['regular', 'exam-prep'] as const) {
  test(`1h block keeps its 3rd line (teacher · room) fully visible — ${kind}`, async () => {
    const L = STR[locale()];
    const loc = locale();
    live = await bootWithOneHourSession(loc, kind);
    const win = live.win;

    await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[loc]);

    await gotoPlanning(win, L);

    const subject = loc === 'ar' ? SUBJECT.ar : SUBJECT.fr;
    const teacher = loc === 'ar' ? TEACHER.nameAr : TEACHER.nameFr;

    // Scope every content assertion to the session button itself so line 2's
    // `09:00` is the block's time range, never the identical hour-gutter label.
    const block = win.locator('button').filter({ hasText: subject }).first();
    await expect(block).toBeVisible();
    await expect(block.getByText('09:00', { exact: false })).toBeVisible();
    await expect(block.getByText(teacher)).toBeVisible();
    await expect(block.getByText(ROOM.name)).toBeVisible();

    if (kind === 'exam-prep') {
      await expect(block.getByText(L.kind.examPrepShort, { exact: true })).toBeVisible();
    }

    const m = await measureBlock(win, {
      subject,
      teacherFr: TEACHER.nameFr,
      teacherAr: TEACHER.nameAr,
      room: ROOM.name,
    });

    // Sanity: the block was found and it really is at the smallest slot height.
    expect(m.found, 'the 1h session block was located in the grid').toBe(true);
    expect(m.metaFound, 'the 3rd line (teacher · room) element was located').toBe(true);
    expect(
      m.height,
      `block height should be one row (HOUR_PX=${HOUR_PX}); got ${m.height}`,
    ).toBeGreaterThanOrEqual(HOUR_PX - 6);
    expect(m.height).toBeLessThanOrEqual(HOUR_PX + 6);

    // The 3rd line text really is the teacher AND the room.
    expect(m.metaText).toContain(teacher);
    expect(m.metaText).toContain(ROOM.name);

    // (1) No vertical overflow — the content fits inside the block box.
    expect(
      m.scrollHeight,
      `block must not overflow: scrollHeight(${m.scrollHeight}) <= clientHeight(${m.clientHeight})`,
    ).toBeLessThanOrEqual(m.clientHeight + 1);

    // (2) The 3rd-line box is fully within the block box.
    expect(
      m.metaRect.bottom,
      `3rd line bottom(${m.metaRect.bottom}) must be within block bottom(${m.blockRect.bottom})`,
    ).toBeLessThanOrEqual(m.blockRect.bottom + 1);
    expect(
      m.metaRect.top,
      `3rd line top(${m.metaRect.top}) must be within block top(${m.blockRect.top})`,
    ).toBeGreaterThanOrEqual(m.blockRect.top - 1);

    await win.screenshot({
      path: `test-results/planning-block-clip-${kind}-${loc}.png`,
    });
  });
}
