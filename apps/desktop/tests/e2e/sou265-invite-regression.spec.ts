import { test, expect } from '@playwright/test';
import {
  T,
  gotoTeamTab,
  openInviteDialog,
  createEmployeeViaForm,
} from './team-users.fixtures';
import { locale, createLiveAppHarness } from './sou265.fixtures';

/**
 * SOU-265 — owner create-employee regression. Proves the new owner/admin role
 * guard lets the director through and the envelope/principal change did not break
 * `user.create` / `user.list`. Black-box: driven only through the UI + preload
 * bridge. Runs under both `fr` (LTR) and `ar` (RTL) projects.
 */

const app = createLiveAppHarness();

test('S1 — owner can still create an employee (role guard lets owner through)', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await app.bootDirector(loc);
  await gotoTeamTab(win, loc);

  await openInviteDialog(win, loc);
  await createEmployeeViaForm(win, { username: 'fatima.secretaire', password: 'Fatima2026!' }, loc);

  await expect(win.getByText(t.createdToast)).toBeVisible();
  // The account is born active — match the new row by role.
  const row = win.getByRole('row', { name: new RegExp(t.roleSecretary) });
  await expect(row).toBeVisible();
  await expect(row.getByText(t.statusActive)).toBeVisible();
  await expect(win.getByRole('row', { name: /directrice/ }).getByText(t.statusActive)).toBeVisible();
  await win.screenshot({ path: `test-results/sou265-s1-roster-${loc}.png` });
});
