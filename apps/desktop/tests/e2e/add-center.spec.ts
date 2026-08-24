import { test, expect, type Page } from '@playwright/test';
import {
  CENTER_A,
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
 * SOU-310 — Add-a-center flow, black-box.
 *
 * A Premium director must be able to create a SECOND center from inside the
 * running app, land in it, and operate it in full isolation from the first — the
 * flow that makes the multi-center entitlement usable (the switcher can only move
 * between centers that already exist). Everything is driven through the running UI;
 * the public bridge is used only to read the same values the user sees.
 *
 * Runs under both the `fr` and `ar` Playwright projects (RTL coverage).
 */

const locale = () => test.info().project.name as Locale;

/** User-facing add-a-center copy, mirrored from i18n {fr,ar}.json. */
const ADD: Record<Locale, { button: string; title: string; submit: string; nameLabel: string }> = {
  fr: {
    button: 'Ajouter un centre',
    title: 'Ajouter un centre',
    submit: 'Créer le centre',
    nameLabel: 'Nom du centre',
  },
  ar: {
    button: 'إضافة مركز',
    title: 'إضافة مركز',
    submit: 'إنشاء المركز',
    nameLabel: 'اسم المركز',
  },
};

const NEW_CENTER_NAME = 'Centre Nouveau QA';

function switcherTrigger(win: Page) {
  return win.getByRole('button', { name: new RegExp(SW[locale()].triggerPrefix) });
}

async function openStudents(win: Page, L: (typeof SW)[Locale]): Promise<void> {
  await expect(win.getByRole('navigation', { name: L.navAria })).toBeVisible();
  await win.getByRole('link', { name: L.navStudents, exact: true }).click();
  await expect(win.getByRole('heading', { level: 1, name: L.studentsHeading })).toBeVisible();
}

test.describe('SOU-310 add a center', () => {
  test.beforeEach(() => {
    // Provisioning the first center launches the app twice before the test window.
    test.setTimeout(180_000);
  });

  test('a Premium director creates a second center and lands in it, fully isolated', async () => {
    const loc = locale();
    const L = SW[loc];
    const A = ADD[loc];
    const dir = freshUserDataDir();

    // Start from a single Premium center with two sentinel students.
    await provisionCenter(loc, 'premium', dir, CENTER_A);

    const { app, win } = await launch({
      locale: loc,
      plan: 'premium',
      centreId: CENTER_A.centreId,
      centerCode: CENTER_A.code,
      userDataDir: dir,
    });

    if (loc === 'ar') await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION.ar);

    // One center → no switching dropdown yet, but the Add-a-center button is present.
    await expect(switcherTrigger(win)).toHaveCount(0);
    const addButton = win.getByRole('button', { name: A.button });
    await expect(addButton).toBeVisible();

    // Open the dialog, fill just the profile, and create.
    await addButton.click();
    const dialog = win.getByRole('dialog');
    await expect(dialog.getByText(A.title)).toBeVisible();
    await dialog.getByLabel(A.nameLabel).fill(NEW_CENTER_NAME);
    await dialog.getByRole('button', { name: A.submit }).click();

    // The app provisions the new DB, switches into it, and lands on its dashboard.
    await expect(win.getByRole('heading', { level: 1, name: L.dashboardHeading })).toBeVisible();

    // It is now the OPEN center, and there are two installed centers.
    const current = await currentCenter(win);
    expect(current.displayName).toBe(NEW_CENTER_NAME);
    const list = await centerList(win);
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.displayName).sort()).toEqual(
      [CENTER_A.displayName, NEW_CENTER_NAME].sort(),
    );

    // Two centers now → the switching dropdown appears, labelled with the new center.
    await expect(switcherTrigger(win)).toHaveAttribute('aria-label', new RegExp(NEW_CENTER_NAME));

    // Full isolation: the new center is empty — none of center A's students leak in.
    expect(await studentTags(win)).toEqual([]);
    await openStudents(win, L);
    for (const tag of CENTER_A.studentTags) {
      await expect(win.getByText(tag)).toHaveCount(0);
    }

    await app.close();
  });
});
