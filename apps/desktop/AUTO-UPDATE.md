# Auto-update (SOU-87)

electron-updater against a **public** GitHub Releases repo:
`soufelhanafi/centresoutien-releases`. The source repo stays private; only
installers + `latest.yml` + `.blockmap` are published there. No token is baked
into the app — the feed is public.

## Behavior

- **Windows**: silent background download, applied on next launch
  (`autoInstallOnAppQuit`). A persistent toast offers "restart now". NSIS
  `.blockmap` gives differential (delta) downloads. Installers are
  Authenticode-signed in CI via SSL.com eSigner when the signing secrets are
  present (SOU-214) — once builds are signed, electron-updater enforces that
  updates carry the same publisher signature. Unsigned → signed is a clean
  transition (integrity is enforced only once builds are signed); see
  `PACKAGING.md` → "Windows CI signing".
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

The version auto-increments — no manual bump.

1. Run the **Package** workflow (`workflow_dispatch`, `publish: true`).
2. `init-release` bumps the patch version in `apps/desktop/package.json`
   (`0.1.0 → 0.1.1`), commits it back to the branch, and creates a draft
   GitHub Release tagged `v<version>`. Each runner uploads its installer +
   `latest.yml`/`latest-mac.yml` to it; `finalize-release` publishes it.
   Release creation is single-writer (SOU-248) — runners never race a
   concurrent create.
3. Existing installs pick it up on next launch.

> Dry runs (`publish: false`) do **not** consume a version. Two concurrent
> publishes are queued (concurrency group) so they never bump from the same
> base.

> **macOS publish caveat:** the arm64 and x64 runners each upload a
> `latest-mac.yml`; the second can clobber the first. This is irrelevant while
> macOS is inert (unsigned). Revisit when signing lands — likely a single
> universal build or a merge step.

## Manual acceptance (Windows)

Build version N, install it. Publish version N+1. Relaunch the N install →
it downloads N+1 in the background and applies it on the next quit/relaunch.
