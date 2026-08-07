import { test, expect, type Page } from '@playwright/test';
import { STR, bootWithClash, bridgeResolve, type Launched, type Locale } from './sync-conflicts.fixtures';

/**
 * SOU-91 — Conflict-resolution popup + "conflits en attente" inbox. Black-box,
 * driven through the running packaged app only. Runs under both the `fr` and
 * `ar` Playwright projects (AR asserts `dir=rtl`).
 *
 * The engine's pull→resolve→push cycle needs a hub (SOU-82); here a blocked
 * field-clash is seeded directly into the durable sync-local store, exactly as
 * `SqliteLocalSyncRepository.blockPending` writes it, and the inbox + popup are
 * exercised: they render, resolution clears the block, and the popup no longer
 * lists the settled clash.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  if (live) {
    // A modal Dialog left open can make `app.close()` hang under the hidden
    // window (`CS_E2E_HIDDEN`) — press Escape first so teardown never blocks.
    try {
      await live.win.keyboard.press('Escape').catch(() => undefined);
    } catch {
      // window already gone
    }
    await live.app.close().catch(() => undefined);
    live = null;
  }
});

async function openSyncPage(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await expect(win.getByRole('navigation', { name: L.navAria })).toBeVisible();
  await win.getByRole('link', { name: L.nav, exact: true }).click();
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

test('the "conflits en attente" inbox lists a blocked field-clash', async () => {
  const L = STR[locale()];
  live = await bootWithClash(locale(), 'premium', true);
  const win = live.win;
  await openSyncPage(win, L);

  await expect(win.getByText(L.inboxTitle)).toBeVisible();
  const openPopup = win.getByRole('button', { name: L.openPopup });
  await expect(openPopup).toBeVisible();
  await openPopup.click();

  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: L.popupTitle })).toBeVisible();
  // Three tabs render; the field-clash tab carries the seeded conflict.
  await expect(dialog.getByRole('tab', { name: new RegExp(L.tabFieldClash) })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: new RegExp(L.tabDeleteVsEdit) })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: new RegExp(L.tabDuplicates) })).toBeVisible();
  await expect(dialog.getByRole('button', { name: L.takeMine })).toBeVisible();
  await expect(dialog.getByRole('button', { name: L.takeTheirs })).toBeVisible();
});

test('resolving take-mine clears the clash from the inbox', async () => {
  const L = STR[locale()];
  live = await bootWithClash(locale(), 'premium', true);
  const win = live.win;
  await openSyncPage(win, L);

  // Settle through the public bridge (the popup's own call path), reload so the
  // React-Query inbox refetches, then confirm the empty state.
  await bridgeResolve(win, {
    entityType: 'students',
    entityId: 'stu_00000000000000000000000001',
    resolution: { choice: 'take-mine' },
  });
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await openSyncPage(win, L);
  await expect(win.getByText(L.inboxEmptyTitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.openPopup })).toHaveCount(0);
});

test('an empty inbox renders the empty state without a popup button', async () => {
  const L = STR[locale()];
  live = await bootWithClash(locale(), 'premium', false);
  const win = live.win;
  await openSyncPage(win, L);

  await expect(win.getByText(L.inboxEmptyTitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.openPopup })).toHaveCount(0);
});

test('Arabic run renders the sync page in RTL', async () => {
  test.skip(locale() !== 'ar', 'RTL assertion runs on the Arabic project');
  const L = STR[locale()];
  live = await bootWithClash(locale(), 'premium', true);
  const win = live.win;
  await openSyncPage(win, L);
  await expect(win.locator('html')).toHaveAttribute('dir', 'rtl');
});
