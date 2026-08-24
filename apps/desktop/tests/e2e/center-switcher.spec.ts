import { test, expect, type Page } from '@playwright/test';
import {
  CENTER_A,
  CENTER_B,
  DIRECTION,
  SW,
  centerList,
  currentCenter,
  freshUserDataDir,
  launch,
  provisionCenter,
  studentTags,
  type Locale,
} from './center-switcher.fixtures';

/**
 * SOU-96 — Center switcher in the app shell, black-box.
 *
 * A director who runs TWO centers must switch between them live (in-process
 * hot-swap, no relaunch) with the two tenants FULLY isolated — no row from one
 * center may ever leak into the other's lists after a switch. The switcher is
 * Premium-gated (`org.multi-center`) and hidden for single-center / non-Premium
 * installs.
 *
 * Runs under both the `fr` and `ar` Playwright projects (RTL coverage). Two
 * centers are provisioned into one userData dir through the app's own boot path;
 * everything else is asserted through the running UI, with the
 * public bridge used only to read the same values the user also sees.
 */

const locale = () => test.info().project.name as Locale;

async function openStudents(win: Page, L: (typeof SW)[Locale]): Promise<void> {
  await expect(win.getByRole('navigation', { name: L.navAria })).toBeVisible();
  await win.getByRole('link', { name: L.navStudents, exact: true }).click();
  await expect(win.getByRole('heading', { level: 1, name: L.studentsHeading })).toBeVisible();
}

/** The header switcher trigger (present only when the dropdown is shown). */
function switcherTrigger(win: Page) {
  return win.getByRole('button', { name: new RegExp(SW[locale()].triggerPrefix) });
}

/** The dashboard "élèves actifs" figure — scoped to the stable Effectifs region id. */
function activeStudentsCount(win: Page) {
  return win.locator('section[aria-labelledby="dashboard-basic-effectifs"] p.tabular-nums').first();
}

/** Pick center `name` from the open switcher menu; the app then lands on the dashboard. */
async function switchTo(win: Page, name: string): Promise<void> {
  await switcherTrigger(win).click();
  await win.getByRole('menuitem', { name: new RegExp(name) }).click();
  await expect(switcherTrigger(win)).toHaveAttribute('aria-label', new RegExp(name));
}

/**
 * Auto-waiting isolation assertion on the Élèves list: every `present` tag must
 * be painted, every `absent` tag must be wholly gone (no cache bleed).
 */
async function expectStudentList(
  win: Page,
  present: readonly string[],
  absent: readonly string[],
): Promise<void> {
  for (const tag of present) await expect(win.getByText(tag).first()).toBeVisible();
  for (const tag of absent) await expect(win.getByText(tag)).toHaveCount(0);
}

test.describe('SOU-96 center switcher', () => {
  test.beforeEach(() => {
    // Provisioning launches the app twice then the test window — well past the default.
    test.setTimeout(180_000);
  });

  test('switches between two centers live with full data isolation', async () => {
    const loc = locale();
    const L = SW[loc];
    const dir = freshUserDataDir();

    await provisionCenter(loc, 'premium', dir, CENTER_A);
    await provisionCenter(loc, 'premium', dir, CENTER_B);

    const { app, win } = await launch({
      locale: loc,
      plan: 'premium',
      centreId: CENTER_A.centreId,
      centerCode: CENTER_A.code,
      userDataDir: dir,
    });

    if (loc === 'ar') await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION.ar);

    // Premium + 2 centers → the switcher is shown, labelled with the OPEN center.
    const trigger = switcherTrigger(win);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-label', new RegExp(CENTER_A.displayName));

    // The list contains both provisioned centers.
    const list = await centerList(win);
    expect(list.map((c) => c.centreId).sort()).toEqual([CENTER_A.centreId, CENTER_B.centreId].sort());

    // The dropdown offers both centers.
    await trigger.click();
    const menu = win.getByRole('menu');
    await expect(menu.getByText(L.label, { exact: true })).toBeVisible();
    await expect(win.getByRole('menuitem', { name: new RegExp(CENTER_A.displayName) })).toBeVisible();
    await expect(win.getByRole('menuitem', { name: new RegExp(CENTER_B.displayName) })).toBeVisible();
    await win.keyboard.press('Escape');

    // Dashboard-count isolation baseline: center A has TWO active students.
    await expect(activeStudentsCount(win)).toHaveText('2');

    // List isolation baseline: only center A's students are on the Élèves list.
    await openStudents(win, L);
    await expectStudentList(win, CENTER_A.studentTags, CENTER_B.studentTags);

    // Switch to B — a live in-process hot-swap; the app lands on B's dashboard.
    await switchTo(win, CENTER_B.displayName);

    // Scenario 3 — the switcher label now reflects the open center, no relaunch.
    expect((await currentCenter(win)).centreId).toBe(CENTER_B.centreId);
    // Scenario 1 — dashboard counts are B's (1), NONE of A's two linger.
    await expect(win.getByRole('heading', { level: 1, name: L.dashboardHeading })).toBeVisible();
    await expect(activeStudentsCount(win)).toHaveText('1');

    // Scenario 1 — B's list shows only B's student; no A row bleeds across.
    await openStudents(win, L);
    await expectStudentList(win, CENTER_B.studentTags, CENTER_A.studentTags);
    expect([...(await studentTags(win))].sort()).toEqual([...CENTER_B.studentTags].sort());

    // Switch back to A — B's data is gone; A's two persisted, never merged.
    await switchTo(win, CENTER_A.displayName);
    await expect(activeStudentsCount(win)).toHaveText('2');
    await openStudents(win, L);
    await expectStudentList(win, CENTER_A.studentTags, CENTER_B.studentTags);
    expect([...(await studentTags(win))].sort()).toEqual([...CENTER_A.studentTags].sort());

    await app.close();
  });

  test('dashboard refreshes when switching while already on the dashboard (SOU-314)', async () => {
    const loc = locale();
    const L = SW[loc];
    const dir = freshUserDataDir();

    await provisionCenter(loc, 'premium', dir, CENTER_A);
    await provisionCenter(loc, 'premium', dir, CENTER_B);

    const { app, win } = await launch({
      locale: loc,
      plan: 'premium',
      centreId: CENTER_A.centreId,
      centerCode: CENTER_A.code,
      userDataDir: dir,
    });

    // Land on the dashboard — center A has TWO active students.
    await expect(win.getByRole('heading', { level: 1, name: L.dashboardHeading })).toBeVisible();
    await expect(activeStudentsCount(win)).toHaveText('2');

    // Switch to B while the dashboard stays mounted — no navigation away.
    await switchTo(win, CENTER_B.displayName);
    expect((await currentCenter(win)).centreId).toBe(CENTER_B.centreId);
    await expect(activeStudentsCount(win)).toHaveText('1');

    // Switching back while still on the dashboard refreshes again to A's two.
    await switchTo(win, CENTER_A.displayName);
    await expect(activeStudentsCount(win)).toHaveText('2');

    await app.close();
  });

  test('single-center install shows a plain center label, no switcher dropdown', async () => {
    const loc = locale();
    const dir = freshUserDataDir();
    await provisionCenter(loc, 'premium', dir, CENTER_A);

    const { app, win } = await launch({
      locale: loc,
      plan: 'premium',
      centreId: CENTER_A.centreId,
      centerCode: CENTER_A.code,
      userDataDir: dir,
    });

    if (loc === 'ar') await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION.ar);

    // No dropdown trigger; the center name is shown as a static label reflecting the open center.
    await expect(switcherTrigger(win)).toHaveCount(0);
    const label = win.locator('[data-slot="center-switcher"]');
    await expect(label).toContainText(CENTER_A.displayName);
    expect((await currentCenter(win)).displayName).toBe(CENTER_A.displayName);

    await app.close();
  });

  test('non-Premium install hides the switcher even with two centers', async () => {
    const loc = locale();
    const dir = freshUserDataDir();
    await provisionCenter(loc, 'premium', dir, CENTER_A);
    await provisionCenter(loc, 'premium', dir, CENTER_B);

    const { app, win } = await launch({
      locale: loc,
      plan: 'essentiel', // lacks org.multi-center
      centreId: CENTER_A.centreId,
      centerCode: CENTER_A.code,
      userDataDir: dir,
    });

    if (loc === 'ar') await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION.ar);

    // The dropdown is gated away; the plain center label still names the open center.
    await expect(switcherTrigger(win)).toHaveCount(0);
    await expect(win.locator('[data-slot="center-switcher"]')).toContainText(CENTER_A.displayName);

    await app.close();
  });
});
