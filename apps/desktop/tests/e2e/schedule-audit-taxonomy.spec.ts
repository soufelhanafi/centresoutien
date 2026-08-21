import { test, expect } from '@playwright/test';
import {
  STR,
  DATE,
  MONDAYS,
  SEED_FIRST_ONLY,
  seedGeneratedSessions,
  addHoliday,
  gotoAudit,
  launch,
  auditRows,
  rowForDate,
  pageCrashed,
  type Launched,
  type Locale,
} from './schedule-audit.fixtures';
import {
  TAXONOMY_STR,
  seedRoomDoubleBook,
  seedTeacherDoubleBook,
  seedOverCapacity,
  seedArchivedRoom,
  restoreRoom,
} from './schedule-audit-taxonomy.fixtures';

/**
 * SOU-296 — the standing "Audit du planning" full conflict taxonomy + SOU-262
 * dedup collapse. Black-box: driven only through the running packaged app + the
 * public preload bridge. Runs under both `fr` (LTR) and `ar` (RTL) projects.
 *
 * The reason badge is a `<span>` inside the group card whose variant carries the
 * severity: `badge-destructive` (hard error — double-books), `badge-warning`
 * (soft warning — over-capacity), `badge-neutral` (info — archived room, and the
 * "repeats weekly ×N" pill). These are observed from the LIVE modal, never source.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** The reason badge `<span>` inside a card whose text is the given label. */
function reasonBadge(win: Launched['win'], text: string) {
  return win.getByRole('dialog').locator('ul > li span', { hasText: text }).first();
}

// ---------------------------------------------------------------------------
// S1 — a recurring room double-book collapses to ONE card with a ×N count, not
// one row per week. Two series (different teachers, same room, same Monday
// 15:00–17:00) forced into collision across 8 Mondays → 16 stranded occurrences,
// all sharing (room-double-booked, Monday, room) → one destructive card.
// ---------------------------------------------------------------------------
test('S1 — recurring room double-book collapses to one card with a ×16 count (not 8 rows)', async () => {
  const L = STR[locale()];
  const T = TAXONOMY_STR[locale()];
  live = await launch(locale());
  const win = live.win;

  await seedRoomDoubleBook(win, 8);
  await gotoAudit(win, L);

  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);
  await expect(win.getByRole('heading', { name: L.pageTitle })).toBeVisible();

  await expect(auditRows(win)).toHaveCount(1);
  await expect(win.getByText(L.groupRepeats(16))).toBeVisible();
  await expect(reasonBadge(win, T.reasonRoomDoubleBooked)).toBeVisible();
  await expect(reasonBadge(win, T.reasonRoomDoubleBooked)).toHaveClass(/badge-destructive/);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou296-s1-room-double-book-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// S1b — the teacher analogue: same teacher, two different rooms, same slot →
// one destructive card for teacher-double-booked (no room collision fired).
// ---------------------------------------------------------------------------
test('S1b — recurring teacher double-book collapses to one card with a ×16 count', async () => {
  const L = STR[locale()];
  const T = TAXONOMY_STR[locale()];
  live = await launch(locale());
  const win = live.win;

  await seedTeacherDoubleBook(win, 8);
  await gotoAudit(win, L);

  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);
  await expect(auditRows(win)).toHaveCount(1);
  await expect(win.getByText(L.groupRepeats(16))).toBeVisible();
  await expect(reasonBadge(win, T.reasonTeacherDoubleBooked)).toBeVisible();
  await expect(reasonBadge(win, T.reasonTeacherDoubleBooked)).toHaveClass(/badge-destructive/);
  await expect(reasonBadge(win, T.reasonRoomDoubleBooked)).toHaveCount(0);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou296-s1b-teacher-double-book-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// S2 — over-capacity is a SOFT warning: 8 live enrollments in a 5-seat room
// surface as `room-over-capacity` with the `badge-warning` variant (never the
// destructive error variant).
// ---------------------------------------------------------------------------
test('S2 — live enrollment over room capacity surfaces as a soft warning badge', async () => {
  const L = STR[locale()];
  const T = TAXONOMY_STR[locale()];
  live = await launch(locale());
  const win = live.win;

  await seedOverCapacity(win);
  await gotoAudit(win, L);

  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);
  await expect(auditRows(win)).toHaveCount(1);
  await expect(reasonBadge(win, T.reasonRoomOverCapacity)).toBeVisible();
  await expect(reasonBadge(win, T.reasonRoomOverCapacity)).toHaveClass(/badge-warning/);
  await expect(reasonBadge(win, T.reasonRoomOverCapacity)).not.toHaveClass(/badge-destructive/);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou296-s2-over-capacity-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// S3 — an archived room that still has dated sessions shows `room-archived`;
// restoring the room and re-opening the audit clears it (live recompute on
// open, not a frozen snapshot).
// ---------------------------------------------------------------------------
test('S3 — archived room strands its dated sessions, and restoring it re-clears the audit', async () => {
  const L = STR[locale()];
  const T = TAXONOMY_STR[locale()];
  live = await launch(locale());
  const win = live.win;

  const seeded = await seedArchivedRoom(win);
  await gotoAudit(win, L);

  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);
  await expect(auditRows(win)).toHaveCount(1);
  await expect(reasonBadge(win, T.reasonRoomArchived)).toBeVisible();

  // Live recompute: un-archive the room, re-open the audit → empty.
  await restoreRoom(win, seeded.roomId);
  await gotoAudit(win, L);
  await expect(win.getByText(L.emptyTitle)).toBeVisible();
  await expect(auditRows(win)).toHaveCount(0);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou296-s3-room-archived-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// S4 — a date-specific one-off keeps its real date (never collapsed into a
// weekly ×N): a single-date holiday strands exactly one occurrence, shown as a
// plain dated row with no "repeats every week" pill and no expand toggle.
// ---------------------------------------------------------------------------
test('S4 — a single-date holiday keeps its real date, never collapsed into a weekly ×N', async () => {
  const L = STR[locale()];
  const D = DATE[locale()];
  live = await launch(locale());
  const win = live.win;

  await seedGeneratedSessions(win, SEED_FIRST_ONLY.from, SEED_FIRST_ONLY.to);
  await addHoliday(win, MONDAYS.first);
  await gotoAudit(win, L);

  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);
  await expect(auditRows(win)).toHaveCount(1);

  const row = rowForDate(win, D.first);
  await expect(row).toBeVisible();
  await expect(row.getByText(L.reasonHoliday)).toBeVisible();
  await expect(row).toContainText(D.first);
  await expect(row.getByText(/Se répète chaque semaine|يتكرر كل أسبوع/)).toHaveCount(0);
  await expect(row.getByRole('button', { name: /Voir les|عرض التواريخ/ })).toHaveCount(0);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou296-s4-holiday-one-off-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// S5 — RTL: the same taxonomy renders under Arabic with `html[dir="rtl"]` and
// the localized soft-warning label (runs in both projects; asserts locale-aware
// direction + label so `ar` proves RTL while `fr` stays LTR).
// ---------------------------------------------------------------------------
test('S5 — Arabic renders RTL with the localized soft-warning label', async () => {
  const L = STR[locale()];
  const T = TAXONOMY_STR[locale()];
  live = await launch(locale());
  const win = live.win;

  await seedOverCapacity(win);
  await gotoAudit(win, L);

  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);
  await expect(reasonBadge(win, T.reasonRoomOverCapacity)).toBeVisible();
  await expect(reasonBadge(win, T.reasonRoomOverCapacity)).toHaveClass(/badge-warning/);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou296-s5-rtl-${locale()}.png` });
});
