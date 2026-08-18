import { test } from '@playwright/test';

/**
 * SOU-265 — secretary/viewer session is rejected at the main-process boundary for
 * `user.create` / `user.list`. BLOCKED-BY-ENV: the renderer hides the Team/Users
 * surface from non-owner roles, so there is NO black-box UI path to a secretary
 * session that reaches those channels. Forcing it would require hacking the
 * renderer or calling IPC directly, which this suite does not do. This rejection
 * is covered by the domain/main-process unit tests (dispatcher.test.ts).
 */
test.skip('S5 — secretary blocked at IPC boundary [BLOCKED-BY-ENV: no UI path; covered by unit tests]', () => {});
