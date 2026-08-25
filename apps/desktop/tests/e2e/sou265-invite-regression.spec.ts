import { test, expect } from '@playwright/test';
import {
  T,
  gotoTeamTab,
  openInviteDialog,
  submitInvite,
  readSetupCode,
} from './team-users.fixtures';
import { locale, createLiveAppHarness } from './sou265.fixtures';

/**
 * SOU-265 — owner invite regression. Proves the new owner/admin role guard lets
 * the director through and the envelope/principal change did not break
 * `user.create` / `user.list`. Black-box: driven only through the UI + preload
 * bridge. Runs under both `fr` (LTR) and `ar` (RTL) projects.
 */

const app = createLiveAppHarness();

test('S1 — owner can still invite an employee (role guard lets owner through)', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await app.bootDirector(loc);
  await gotoTeamTab(win, loc);

  await openInviteDialog(win, loc);
  await submitInvite(win, loc);

  await expect(win.getByRole('heading', { name: t.setupCodeTitle })).toBeVisible();
  const code = await readSetupCode(win);
  expect(code, 'a non-empty one-time setup code is minted').toMatch(/[A-Z0-9-]{6,}/);
  await win.screenshot({ path: `test-results/sou265-s1-setup-code-${loc}.png` });

  await win.getByRole('button', { name: t.setupCodeDone }).click();
  // Code-first: the pending invite carries no identity yet — match it by role.
  const row = win.getByRole('row', { name: new RegExp(t.roleSecretary) });
  await expect(row).toBeVisible();
  await expect(row.getByText(t.pendingName)).toBeVisible();
  await expect(row.getByText(t.statusPending)).toBeVisible();
  await expect(win.getByRole('row', { name: /directrice/ }).getByText(t.statusActive)).toBeVisible();
  await win.screenshot({ path: `test-results/sou265-s1-roster-${loc}.png` });
});
