# Auto-update Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship electron-updater auto-update via a public GitHub Releases feed — silent background download, apply on next launch — working on Windows, wired-but-inert on macOS until signing.

**Architecture:** All changes live in `apps/desktop`. A pure, unit-tested policy module decides whether the updater runs and whether it may apply. A thin main-process service wires `electron-updater`'s `autoUpdater` to that policy and forwards normalized status over a one-way IPC event. The renderer subscribes and raises a persistent Sonner toast with a "restart now" action. No `packages/domain`, entity, migration, sync, or plan-gating changes.

**Tech Stack:** Electron 43, electron-builder 26, electron-updater, React 19, react-i18next, Sonner (via `@centresoutien/ui`), Vitest.

## Global Constraints

- **Layer isolation:** updater code is Electron main/renderer infra only. Do NOT import `electron`, `electron-updater`, `fs`, or any adapter into `packages/domain`. Do NOT import `electron-updater` into the renderer — the renderer only touches `window.api` and shared `type`s from `apps/desktop/src/shared/ipc/`.
- **No `any`, no `@ts-ignore`** without an explaining comment. `strict` TS.
- **i18n parity:** every new user-facing string exists in BOTH `fr.json` and `ar.json` under the same key. No hardcoded strings in JSX.
- **RTL-safe:** logical Tailwind props only (`ps-*`/`pe-*`/`ms-*`/`me-*`). The update surface is text-only inside the already direction-aware Sonner `Toaster`.
- **Update host:** `provider: github`, `owner: soufelhanafi`, `repo: centresoutien-releases` (dedicated public repo). No token baked into the app; publish uses CI secret `CS_RELEASES_TOKEN` → env `GH_TOKEN`.
- **Platform scope:** Windows applies updates; macOS is check-only until signed (`isMacSigned = false` for now). Linux disabled.
- **Check cadence:** first check `10_000` ms after launch, then every `6h` (`21_600_000` ms).
- **Commit trailer (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017ZYFfBvw6nmDepBThQQKb7
  ```
- **Verify before done:** `pnpm --filter @centresoutien/desktop typecheck && pnpm --filter @centresoutien/desktop lint` clean after each task; unit tests where present.

---

### Task 1: Update policy (pure, tested)

The only logic worth testing, isolated from electron so it runs under plain Vitest.

**Files:**
- Create: `apps/desktop/src/main/updater/update-policy.ts`
- Test: `apps/desktop/tests/unit/updater/update-policy.test.ts`

**Interfaces:**
- Produces:
  - `resolveUpdaterCapability(input: { isPackaged: boolean; platform: NodeJS.Platform; isMacSigned: boolean }): { enabled: boolean; canApply: boolean }`
  - `isCheckDue(input: { lastCheckAt: number | null; now: number; intervalMs: number }): boolean`
  - `UPDATE_CHECK_INTERVAL_MS: number` (`21_600_000`)
  - `UPDATE_FIRST_CHECK_DELAY_MS: number` (`10_000`)

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/tests/unit/updater/update-policy.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveUpdaterCapability,
  isCheckDue,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
} from '../../../src/main/updater/update-policy';

describe('resolveUpdaterCapability', () => {
  it('disables the updater entirely when not packaged (dev / e2e)', () => {
    expect(resolveUpdaterCapability({ isPackaged: false, platform: 'win32', isMacSigned: true }))
      .toEqual({ enabled: false, canApply: false });
  });

  it('enables and can apply on packaged Windows', () => {
    expect(resolveUpdaterCapability({ isPackaged: true, platform: 'win32', isMacSigned: false }))
      .toEqual({ enabled: true, canApply: true });
  });

  it('enables check-only on packaged unsigned macOS (cannot apply)', () => {
    expect(resolveUpdaterCapability({ isPackaged: true, platform: 'darwin', isMacSigned: false }))
      .toEqual({ enabled: true, canApply: false });
  });

  it('enables and can apply on packaged signed macOS', () => {
    expect(resolveUpdaterCapability({ isPackaged: true, platform: 'darwin', isMacSigned: true }))
      .toEqual({ enabled: true, canApply: true });
  });

  it('disables on Linux', () => {
    expect(resolveUpdaterCapability({ isPackaged: true, platform: 'linux', isMacSigned: true }))
      .toEqual({ enabled: false, canApply: false });
  });
});

describe('isCheckDue', () => {
  it('is due on the first check when no prior check recorded', () => {
    expect(isCheckDue({ lastCheckAt: null, now: 1_000, intervalMs: UPDATE_CHECK_INTERVAL_MS })).toBe(true);
  });

  it('is due once the interval has elapsed', () => {
    expect(isCheckDue({ lastCheckAt: 0, now: UPDATE_CHECK_INTERVAL_MS, intervalMs: UPDATE_CHECK_INTERVAL_MS })).toBe(true);
  });

  it('is not due before the interval elapses', () => {
    expect(isCheckDue({ lastCheckAt: 0, now: UPDATE_CHECK_INTERVAL_MS - 1, intervalMs: UPDATE_CHECK_INTERVAL_MS })).toBe(false);
  });

  it('exposes the cadence constants', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(21_600_000);
    expect(UPDATE_FIRST_CHECK_DELAY_MS).toBe(10_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @centresoutien/desktop test -- update-policy`
Expected: FAIL — cannot resolve `src/main/updater/update-policy`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/desktop/src/main/updater/update-policy.ts

/** How the updater may behave on this build. `enabled` gates running the
 * updater at all; `canApply` gates auto-download + quitAndInstall. macOS is
 * check-only until a Developer ID signing ticket lands, because Squirrel.Mac
 * refuses to apply unsigned updates. */
export type UpdaterCapability = {
  enabled: boolean;
  canApply: boolean;
};

const DISABLED: UpdaterCapability = { enabled: false, canApply: false };

export function resolveUpdaterCapability(input: {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  isMacSigned: boolean;
}): UpdaterCapability {
  if (!input.isPackaged) {
    return DISABLED;
  }
  if (input.platform === 'win32') {
    return { enabled: true, canApply: true };
  }
  if (input.platform === 'darwin') {
    return { enabled: true, canApply: input.isMacSigned };
  }
  return DISABLED;
}

export function isCheckDue(input: {
  lastCheckAt: number | null;
  now: number;
  intervalMs: number;
}): boolean {
  if (input.lastCheckAt === null) {
    return true;
  }
  return input.now - input.lastCheckAt >= input.intervalMs;
}

export const UPDATE_CHECK_INTERVAL_MS = 21_600_000;
export const UPDATE_FIRST_CHECK_DELAY_MS = 10_000;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @centresoutien/desktop test -- update-policy`
Expected: PASS (9 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/updater/update-policy.ts apps/desktop/tests/unit/updater/update-policy.test.ts
git commit -m "feat(SOU-87): update-policy — platform gating + check cadence

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ZYFfBvw6nmDepBThQQKb7"
```

---

### Task 2: IPC seam (shared contract + preload bridge)

One-way status event (main→renderer) + one-way restart command (renderer→main), mirroring the existing `CENTER_CHANGED_EVENT` pattern in `shared/ipc/center-events.ts`. Restart is a fire-and-forget `send`/`on` (no response), so it stays OUT of the typed invoke `contract.ts`.

**Files:**
- Create: `apps/desktop/src/shared/ipc/update-events.ts`
- Modify: `apps/desktop/src/shared/ipc/api.ts` (add two methods to `DesktopApi`)
- Modify: `apps/desktop/src/preload/index.ts` (implement the two methods)

**Interfaces:**
- Produces:
  - `UPDATE_STATUS_EVENT = 'update.status'`, `UPDATE_RESTART_COMMAND = 'update.restart-now'`
  - `type UpdateStatusEvent` (discriminated union, `state` tag)
  - `DesktopApi.onUpdateStatus(listener: (event: UpdateStatusEvent) => void): () => void`
  - `DesktopApi.restartNow(): void`
- Consumes: existing `DesktopApi` shape, existing preload `api` object.

- [ ] **Step 1: Create the shared contract**

```ts
// apps/desktop/src/shared/ipc/update-events.ts

/**
 * Main→renderer push channel (SOU-87). One-way `webContents.send` /
 * `ipcRenderer.on`, like {@link CENTER_CHANGED_EVENT}: main forwards
 * electron-updater lifecycle as a normalized status; the renderer decides
 * what to surface. Named constants so emitter and subscriber never drift.
 */
export const UPDATE_STATUS_EVENT = 'update.status';

/**
 * Renderer→main fire-and-forget command (SOU-87): the user clicked "restart
 * now" on the update toast. No response — main calls `quitAndInstall`, so the
 * process exits. Deliberately a `send`/`on` command, not a typed invoke
 * channel, because there is nothing to await.
 */
export const UPDATE_RESTART_COMMAND = 'update.restart-now';

/** Normalized updater lifecycle forwarded over {@link UPDATE_STATUS_EVENT}. */
export type UpdateStatusEvent =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };
```

- [ ] **Step 2: Extend the `DesktopApi` type**

In `apps/desktop/src/shared/ipc/api.ts`, add the import and two members:

```ts
import type { UpdateStatusEvent } from './update-events';
```

Inside `export interface DesktopApi { ... }`, after `onCenterChanged(...)`:

```ts
  /**
   * Subscribe to updater status (SOU-87). Fires as electron-updater checks,
   * downloads, and finishes. Returns an unsubscribe function — call it on
   * unmount to detach the ipcRenderer listener.
   */
  onUpdateStatus(listener: (event: UpdateStatusEvent) => void): () => void;
  /** Ask main to quit and install a downloaded update now (SOU-87). */
  restartNow(): void;
```

- [ ] **Step 3: Implement in the preload bridge**

In `apps/desktop/src/preload/index.ts`, add the import:

```ts
import {
  UPDATE_STATUS_EVENT,
  UPDATE_RESTART_COMMAND,
  type UpdateStatusEvent,
} from '../shared/ipc/update-events';
```

Add to the `api` object (after `onCenterChanged`):

```ts
  onUpdateStatus: (listener: (event: UpdateStatusEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, payload: UpdateStatusEvent): void =>
      listener(payload);
    ipcRenderer.on(UPDATE_STATUS_EVENT, subscription);
    return () => ipcRenderer.removeListener(UPDATE_STATUS_EVENT, subscription);
  },
  restartNow: (): void => ipcRenderer.send(UPDATE_RESTART_COMMAND),
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @centresoutien/desktop typecheck`
Expected: PASS (preload `api` again satisfies `DesktopApi`).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/ipc/update-events.ts apps/desktop/src/shared/ipc/api.ts apps/desktop/src/preload/index.ts
git commit -m "feat(SOU-87): IPC seam for update status + restart command

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ZYFfBvw6nmDepBThQQKb7"
```

---

### Task 3: Main-process auto-updater service + wiring

Installs `electron-updater`, wires `autoUpdater` to the policy, forwards status, registers the restart command, and initializes from the main entry behind the policy guard.

**Files:**
- Create: `apps/desktop/src/main/updater/auto-updater-service.ts`
- Modify: `apps/desktop/package.json` (add `electron-updater` to `dependencies`)
- Modify: `apps/desktop/src/main/index.ts` (call `initAutoUpdater` after the main window exists)

**Interfaces:**
- Consumes: `resolveUpdaterCapability`, `isCheckDue`, `UPDATE_CHECK_INTERVAL_MS`, `UPDATE_FIRST_CHECK_DELAY_MS` (Task 1); `UPDATE_STATUS_EVENT`, `UPDATE_RESTART_COMMAND`, `UpdateStatusEvent` (Task 2).
- Produces: `initAutoUpdater(deps: { isMacSigned: boolean; getWebContents: () => Electron.WebContents | null }): void`

- [ ] **Step 1: Install the dependency**

Run: `pnpm --filter @centresoutien/desktop add electron-updater`
Expected: `electron-updater` appears under `dependencies` in `apps/desktop/package.json` (NOT devDependencies — it must ship unbundled, like other runtime deps; electron-vite externalizes it automatically).

- [ ] **Step 2: Write the service**

```ts
// apps/desktop/src/main/updater/auto-updater-service.ts
import { app, ipcMain, type WebContents } from 'electron';
import electronUpdater from 'electron-updater';
import {
  resolveUpdaterCapability,
  isCheckDue,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
} from './update-policy';
import {
  UPDATE_STATUS_EVENT,
  UPDATE_RESTART_COMMAND,
  type UpdateStatusEvent,
} from '../../shared/ipc/update-events';

// electron-updater is CommonJS; the named `autoUpdater` export is only reachable
// through the default import under electron-vite's ESM output.
const { autoUpdater } = electronUpdater;

export type AutoUpdaterDeps = {
  isMacSigned: boolean;
  getWebContents: () => WebContents | null;
};

export function initAutoUpdater(deps: AutoUpdaterDeps): void {
  const capability = resolveUpdaterCapability({
    isPackaged: app.isPackaged,
    platform: process.platform,
    isMacSigned: deps.isMacSigned,
  });
  if (!capability.enabled) {
    return;
  }

  autoUpdater.autoDownload = capability.canApply;
  autoUpdater.autoInstallOnAppQuit = capability.canApply;
  autoUpdater.logger = {
    info: (...a: unknown[]) => console.info('[updater]', ...a),
    warn: (...a: unknown[]) => console.warn('[updater]', ...a),
    error: (...a: unknown[]) => console.error('[updater]', ...a),
    debug: (...a: unknown[]) => console.debug('[updater]', ...a),
  };

  const emit = (event: UpdateStatusEvent): void => {
    deps.getWebContents()?.send(UPDATE_STATUS_EVENT, event);
  };

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => emit({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => emit({ state: 'not-available' }));
  autoUpdater.on('download-progress', (progress) =>
    emit({ state: 'downloading', percent: Math.round(progress.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) => emit({ state: 'downloaded', version: info.version }));
  // Errors are logged and surfaced as a status, never thrown into a modal — an
  // offline center must never see an update crash.
  autoUpdater.on('error', (error) => emit({ state: 'error', message: error.message }));

  if (capability.canApply) {
    ipcMain.on(UPDATE_RESTART_COMMAND, () => autoUpdater.quitAndInstall());
  }

  let lastCheckAt: number | null = null;
  const check = (): void => {
    if (!isCheckDue({ lastCheckAt, now: Date.now(), intervalMs: UPDATE_CHECK_INTERVAL_MS })) {
      return;
    }
    lastCheckAt = Date.now();
    void autoUpdater
      .checkForUpdates()
      .catch((error: unknown) => emit({ state: 'error', message: String(error) }));
  };

  setTimeout(check, UPDATE_FIRST_CHECK_DELAY_MS);
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}
```

- [ ] **Step 3: Wire it into the main entry**

In `apps/desktop/src/main/index.ts`, add the import near the other local main imports:

```ts
import { initAutoUpdater } from './updater/auto-updater-service';
```

Find where the main window is created (`createMainWindow` is imported from `./window`, and `mainWindow?.webContents.send(CENTER_CHANGED_EVENT, ...)` is already used ~line 345, so a `mainWindow` reference is in scope). Immediately after the main window has been created/assigned during bootstrap, add:

```ts
    // SOU-87: auto-update. Self-guards via app.isPackaged (off in dev/e2e).
    // isMacSigned is false until the macOS Developer ID signing ticket ships —
    // macOS runs check-only and never attempts a (failing) unsigned apply.
    initAutoUpdater({
      isMacSigned: false,
      getWebContents: () => mainWindow?.webContents ?? null,
    });
```

If the `mainWindow` binding name differs at that point in the file, use whatever the window variable is named there — the requirement is only that `getWebContents` returns the live main window's `webContents` or `null`.

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm --filter @centresoutien/desktop typecheck`
Expected: PASS.
Run: `pnpm --filter @centresoutien/desktop build`
Expected: PASS — `electron-updater` resolves and the main bundle builds.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/updater/auto-updater-service.ts apps/desktop/src/main/index.ts apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat(SOU-87): main-process auto-updater service + init wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ZYFfBvw6nmDepBThQQKb7"
```

---

### Task 4: Renderer update prompt (hook + toast + i18n)

Subscribe to update status; on `downloaded`, raise a persistent Sonner toast with a "restart now" action. Reuses the existing `Toaster` already mounted in `App.tsx`.

**Files:**
- Create: `apps/desktop/src/renderer/hooks/use-app-update.ts`
- Modify: `apps/desktop/src/renderer/App.tsx` (call the hook once)
- Modify: `apps/desktop/src/renderer/i18n/fr.json` (add `update` keys)
- Modify: `apps/desktop/src/renderer/i18n/ar.json` (add `update` keys)

**Interfaces:**
- Consumes: `window.api.onUpdateStatus`, `window.api.restartNow` (Task 2); `UpdateStatusEvent` (Task 2); `toast` from `@centresoutien/ui`; `useTranslation` from `react-i18next`.
- Produces: `useAppUpdate(): void`

- [ ] **Step 1: Write the hook**

```ts
// apps/desktop/src/renderer/hooks/use-app-update.ts
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { UpdateStatusEvent } from '../../shared/ipc/update-events';

const UPDATE_TOAST_ID = 'app-update-ready';

/**
 * SOU-87: surfaces a downloaded update as a persistent toast with a restart
 * action. Only the `downloaded` state is user-facing — checking/downloading are
 * silent by design. On Windows the restart applies the update; on unsigned
 * macOS the download never completes, so this toast simply never appears there.
 */
export function useAppUpdate(): void {
  const { t } = useTranslation();

  useEffect(() => {
    const dispose = window.api.onUpdateStatus((event: UpdateStatusEvent) => {
      if (event.state !== 'downloaded') {
        return;
      }
      toast(t('update.readyTitle'), {
        id: UPDATE_TOAST_ID,
        description: t('update.readyDescription', { version: event.version }),
        duration: Infinity,
        action: {
          label: t('update.restartNow'),
          onClick: () => window.api.restartNow(),
        },
      });
    });
    return dispose;
  }, [t]);
}
```

- [ ] **Step 2: Mount the hook in `App.tsx`**

In `apps/desktop/src/renderer/App.tsx`, import and call the hook inside the `App` component body (before the returned JSX, alongside other top-level hooks):

```ts
import { useAppUpdate } from './hooks/use-app-update';
```

```ts
  useAppUpdate();
```

- [ ] **Step 3: Add French strings**

In `apps/desktop/src/renderer/i18n/fr.json`, add a top-level `"update"` block (keep the file's existing key ordering/style):

```json
  "update": {
    "readyTitle": "Mise à jour prête",
    "readyDescription": "La version {{version}} sera installée au prochain démarrage.",
    "restartNow": "Redémarrer maintenant"
  },
```

- [ ] **Step 4: Add Arabic strings**

In `apps/desktop/src/renderer/i18n/ar.json`, add the SAME keys:

```json
  "update": {
    "readyTitle": "التحديث جاهز",
    "readyDescription": "سيتم تثبيت الإصدار {{version}} عند إعادة التشغيل التالية.",
    "restartNow": "إعادة التشغيل الآن"
  },
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `pnpm --filter @centresoutien/desktop typecheck && pnpm --filter @centresoutien/desktop lint`
Expected: PASS. (If `window.api` is not globally typed at the hook, it already is — `onCenterChanged` is consumed the same way; if a `Window['api']` augmentation is missing, add `declare global { interface Window { api: import('../shared/ipc/api').DesktopApi } }` — but verify first, it should already exist.)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/hooks/use-app-update.ts apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/i18n/fr.json apps/desktop/src/renderer/i18n/ar.json
git commit -m "feat(SOU-87): renderer update-ready toast (FR/AR) + restart action

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ZYFfBvw6nmDepBThQQKb7"
```

---

### Task 5: Publish config + CI + docs

Point the build at the public releases repo, make CI publish, and document the flow + macOS caveat.

**Files:**
- Modify: `apps/desktop/electron-builder.yml` (add `publish:` block)
- Modify: `.github/workflows/package.yml` (publish + `GH_TOKEN`)
- Create: `apps/desktop/AUTO-UPDATE.md`

**Interfaces:** none (config + docs).

- [ ] **Step 1: Add the publish provider to electron-builder**

Append to `apps/desktop/electron-builder.yml`:

```yaml
# SOU-87: auto-update feed. Dedicated PUBLIC releases repo so the source repo
# stays private and no token is baked into the app. electron-builder bakes
# app-update.yml into every build from this block, and on `--publish` uploads
# the installer + latest.yml + .blockmap to the GitHub Release.
publish:
  provider: github
  owner: soufelhanafi
  repo: centresoutien-releases
```

- [ ] **Step 2: Make CI publish**

In `.github/workflows/package.yml`, change the Package step (currently lines ~55-56) to pass a `GH_TOKEN` and `--publish always`:

```yaml
      - name: Package (${{ matrix.artifact }})
        env:
          GH_TOKEN: ${{ secrets.CS_RELEASES_TOKEN }}
        run: pnpm --filter @centresoutien/desktop ${{ matrix.script }} --publish always
```

(The trailing `--publish always` is forwarded to `electron-builder` at the end of each `dist:*` script; `GH_TOKEN` is the token electron-builder's github publisher reads.)

- [ ] **Step 3: Write the doc**

```markdown
<!-- apps/desktop/AUTO-UPDATE.md -->
# Auto-update (SOU-87)

electron-updater against a **public** GitHub Releases repo:
`soufelhanafi/centresoutien-releases`. The source repo stays private; only
installers + `latest.yml` + `.blockmap` are published there. No token is baked
into the app — the feed is public.

## Behavior

- **Windows**: silent background download, applied on next launch
  (`autoInstallOnAppQuit`). A persistent toast offers "restart now". NSIS
  `.blockmap` gives differential (delta) downloads.
- **macOS**: check-only and inert until a Developer ID signing + notarization
  ticket ships. Squirrel.Mac refuses to apply unsigned updates, so the app does
  not download on macOS (`autoDownload = false` there) and never shows the toast.
  Flip `isMacSigned` to `true` at the `initAutoUpdater` call site once signed.
- **Dev / E2E**: disabled (`app.isPackaged` is false).

Cadence: first check 10s after launch, then every 6h.

## One-time setup

1. Create the public repo `soufelhanafi/centresoutien-releases`.
2. Create a PAT with `contents: write` on that repo; add it as the Actions
   secret `CS_RELEASES_TOKEN` on the source repo.

## Publishing a release

1. Bump `version` in `apps/desktop/package.json` (must exceed installed builds).
2. Run the **Package** workflow (`workflow_dispatch`). Each runner builds its
   installer and publishes to a GitHub Release tagged `v<version>`.
3. Existing installs pick it up on next launch.

> **macOS publish caveat:** the arm64 and x64 runners each upload a
> `latest-mac.yml`; the second can clobber the first. This is irrelevant while
> macOS is inert (unsigned). Revisit when signing lands — likely a single
> universal build or a merge step.

## Manual acceptance (Windows)

Build version N, install it. Publish version N+1. Relaunch the N install →
it downloads N+1 in the background and applies it on the next quit/relaunch.
```

- [ ] **Step 4: Sanity-check the config**

Run: `pnpm --filter @centresoutien/desktop build`
Expected: PASS (build still succeeds; `publish:` doesn't affect a non-publishing local build).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron-builder.yml .github/workflows/package.yml apps/desktop/AUTO-UPDATE.md
git commit -m "feat(SOU-87): publish to public releases repo + CI publish + docs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ZYFfBvw6nmDepBThQQKb7"
```

---

## Pre-merge gate

After all tasks:

- [ ] `pnpm --filter @centresoutien/desktop typecheck` — clean
- [ ] `pnpm --filter @centresoutien/desktop lint` — 0 warnings
- [ ] `pnpm --filter @centresoutien/desktop test` — green (update-policy suite included)
- [ ] `pnpm --filter @centresoutien/desktop build` — succeeds
- [ ] i18n parity: `update.readyTitle/readyDescription/restartNow` present in both `fr.json` and `ar.json`
- [ ] Run the `pre-merge-check` skill before opening the PR
- [ ] Manual note in PR: macOS inert until signing; Windows path verified via a real N→N+1 publish once the releases repo + `CS_RELEASES_TOKEN` exist

## Post-merge (outside code)

- [ ] Create public repo `soufelhanafi/centresoutien-releases`
- [ ] Add `CS_RELEASES_TOKEN` Actions secret
- [ ] File the follow-up ticket: macOS Developer ID signing + notarization (unblocks macOS auto-update; flip `isMacSigned`)
- [ ] Move SOU-87 → Done, which closes Epic 10 (SOU-14)
