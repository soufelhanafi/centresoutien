# SOU-87 — Auto-update Channel — Design

**Status:** Approved (brainstorm) — ready for implementation plan
**Date:** 2026-08-11
**Epic:** SOU-14 — Plan Gating & Packaging (this is the last open child; closing it closes the epic)
**Depends on:** SOU-86 (electron-builder packaging — Done)

---

## 1. Goal

`electron-updater` with **GitHub Releases** as the update channel. Silent background
download, apply on next launch, delta updates where the platform supports them.

**Done when:** publishing a new release to the channel makes existing installs offer
the upgrade on next launch.

---

## 2. Decisions locked in brainstorm

| Decision | Choice | Reason |
|---|---|---|
| Update host | GitHub Releases, **dedicated public repo** `centresoutien-releases` | Free, purpose-built (`github` provider auto-handles `latest.yml` + blockmaps + delta), reuses existing `package.yml` CI matrix. Source repo stays private; only installers are public. No token baked into the app. |
| Platform scope | **Both, macOS best-effort** | Windows NSIS updates work unsigned. macOS (Squirrel.Mac) refuses to apply unsigned updates, so it no-ops silently until a Developer ID signing ticket lands. Code is wired for both now. |
| UX | Silent download, apply on next launch (`autoInstallOnAppQuit`), plus a non-blocking "update ready — restart" nudge | Matches ticket. No forced restart. |

**Explicitly out of scope (YAGNI):** staged rollouts, in-app changelog, forced updates,
an update-settings screen, macOS signing/notarization (separate future ticket).

---

## 3. Architecture

All changes live in `apps/desktop`. The updater is an **Electron main-process concern**
(infra / presentation adapter). The renderer only displays update state and offers a
"restart now" button. **`packages/domain` is not touched.** No entity, migration, sync,
or plan-gating impact — auto-update is infrastructure available on every plan.

```
main process                          renderer
────────────                          ────────
update-policy.ts   (pure, tested)
auto-updater-service.ts ── IPC ──▶  use-app-update.ts ──▶ UpdateBanner
   (wires electron-updater)   update:status              (FR/AR, RTL)
   quitAndInstall  ◀── IPC ──  update:restart-now
```

### 3.1 Packaging / feed

- Add `electron-updater` to `apps/desktop/package.json` dependencies.
- `apps/desktop/electron-builder.yml`: add
  ```yaml
  publish:
    provider: github
    owner: soufelhanafi
    repo: centresoutien-releases
  ```
  This bakes `app-update.yml` into every build and, on `--publish`, uploads the
  installer + `latest.yml` + `.blockmap` to the GitHub Release.
- `.github/workflows/package.yml`: add `--publish always` to the build step and a
  `GH_TOKEN` secret (a PAT with write access to `centresoutien-releases`).
- Windows NSIS `.blockmap` yields **differential (delta)** downloads automatically.
  macOS dmg has no delta — acceptable under best-effort.

### 3.2 Main process — `apps/desktop/src/main/updater/`

**`update-policy.ts` — pure, no electron import, unit-tested**
- `shouldEnableUpdater({ isPackaged, platform, isSigned }): boolean`
  - `false` when `!isPackaged` (dev + E2E).
  - `true` on `win32` when packaged.
  - macOS: `true` for check/notify, but download+apply are skipped when `!isSigned`
    (best-effort) — surfaced as a policy flag, not as an autoUpdater error.
- `nextCheckDue(lastCheckAt: number | null, now: number, intervalMs: number): boolean`
  — drives the launch + periodic (every 6h) check cadence.

**`auto-updater-service.ts` — thin imperative wiring**
- Configures `autoUpdater`: `autoDownload = true`, `autoInstallOnAppQuit = true`,
  logger attached.
- Guards startup through `shouldEnableUpdater`; on unsigned macOS, runs check-only and
  logs (no error dialog, no download→fail loop).
- Wires events (`checking-for-update`, `update-available`, `update-not-available`,
  `download-progress`, `update-downloaded`, `error`) → forwards a normalized status over
  IPC. Errors are logged, never thrown to a modal.
- First check after a short post-launch delay (avoid competing with window/db startup);
  then every 6h via `nextCheckDue`.
- Invoked from the main entry / composition root **after** the main window is ready,
  behind the `app.isPackaged` guard.

### 3.3 IPC + preload

- Channels: `update:status` (main → renderer, event payload:
  `{ state: 'checking' | 'available' | 'downloading' | 'downloaded' | 'error', … }`),
  `update:restart-now` (renderer → main → `autoUpdater.quitAndInstall`).
- Preload exposes a typed `update` bridge: `onStatus(cb)`, `restartNow()`. Follows the
  existing preload contract pattern; `contextIsolation` preserved.

### 3.4 Renderer

- `use-app-update.ts` hook subscribes to `update:status`, exposes state + `restartNow`.
- `UpdateBanner` (or toast) shows only on `downloaded`: "Mise à jour prête — redémarrer
  maintenant / plus tard". Non-blocking.
- New i18n keys in `fr.json` + `ar.json` (same key structure). Logical Tailwind
  properties only (`ps-*`, `pe-*`, `ms-*`), RTL-safe; any directional icon mirrored.

---

## 4. Testing & verification

- **Unit** (`apps/desktop/tests/unit/updater/update-policy.test.ts`): platform gating
  (dev off, win on, mac unsigned check-only), `nextCheckDue` cadence boundaries.
- The `auto-updater-service` wiring is thin and imperative — not unit-tested against a
  live autoUpdater; covered by manual release verification.
- **No E2E** — the "offer upgrade on next launch" acceptance needs a live network + a
  real published release, which E2E against the packaged app cannot fake cheaply. This
  is a deliberate MVP trade-off (consistent with the e2e-testing skill: E2E is reserved
  for critical, fakeable flows).
- **Manual acceptance:** bump version, `--publish` a release to `centresoutien-releases`,
  launch a prior Windows install, confirm it downloads and applies on next launch.
  Documented in the new doc.

---

## 5. Files touched

**Add**
- `apps/desktop/src/main/updater/update-policy.ts`
- `apps/desktop/src/main/updater/auto-updater-service.ts`
- `apps/desktop/src/renderer/hooks/use-app-update.ts`
- `apps/desktop/src/renderer/components/**/UpdateBanner.tsx` (location per existing convention)
- `apps/desktop/tests/unit/updater/update-policy.test.ts`
- `apps/desktop/AUTO-UPDATE.md` (or a section appended to `PACKAGING.md`)

**Edit**
- `apps/desktop/package.json` (dep + any publish script)
- `apps/desktop/electron-builder.yml` (`publish:` block)
- `apps/desktop/src/main/index.ts` / composition root (guarded init)
- `apps/desktop/src/preload/**` (typed `update` bridge)
- `apps/desktop/src/renderer/i18n/fr.json` + `ar.json` (new keys)
- `.github/workflows/package.yml` (`--publish always` + `GH_TOKEN`)

**Infra (outside the repo, one-time, manual by the maintainer)**
- Create the public `centresoutien-releases` GitHub repo.
- Add the `GH_TOKEN` PAT as a CI secret.

---

## 6. Risks / notes

- **macOS is inert until signing.** The wiring is present but real macOS updates do not
  work until a Developer ID cert + notarization ticket ships. The design intentionally
  makes this a silent no-op, not a broken/erroring path. Flag a follow-up ticket.
- **Publishing requires the releases repo + `GH_TOKEN`** to exist before the CI publish
  step will succeed; until then the build step runs without `--publish` locally.
- **First-run version floor:** electron-updater compares against `latest.yml`; the first
  published release just needs a version greater than any installed build.
