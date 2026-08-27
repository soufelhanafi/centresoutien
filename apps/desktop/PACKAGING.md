# Packaging (SOU-86)

Scope locked in the SOU-86 KICKOFF comment: self-signed dev certs only,
controlled in-person demo installs. Real cert purchase, notarization with a
real Apple ID, and auto-update are separate follow-up tickets (the latter is
SOU-87).

## Building

```bash
pnpm --filter @centresoutien/desktop dist       # current platform's installer
pnpm --filter @centresoutien/desktop dist:mac   # dmg (must run on macOS)
pnpm --filter @centresoutien/desktop dist:mac:arm64 # Apple Silicon dmg
pnpm --filter @centresoutien/desktop dist:mac:x64   # Intel Mac dmg
pnpm --filter @centresoutien/desktop dist:win   # NSIS installer (must run on Windows)
```

Each `dist*` script runs `dist:prepare` first, which rebuilds
`better-sqlite3-multiple-ciphers` for the Electron ABI and runs
`electron-vite build` before electron-builder packages the app. This is an
explicit `pnpm dist:prepare &&` prefix rather than an npm `pre`-hook —
`predist` only matches the exact script name `dist`, not `dist:mac` /
`dist:win`, so a `pre`-hook would silently skip the rebuild for platform-
specific builds.

### Why each platform must build on its own OS

`better-sqlite3-multiple-ciphers` and `@node-rs/argon2` are native modules.
Their compiled `.node` binaries are only valid for the OS/arch that produced
them — there is no cross-compile step in this setup. Building `dist:win` on
macOS (or vice versa) would silently bundle the wrong binary and crash on
first database access. `dist` builds only for the host platform for this
reason; `.github/workflows/package.yml` runs a `macos-latest` arm64 / `macos-
13` x64 / `windows-latest` x64 matrix (manual `workflow_dispatch`) so each
installer is built on its real target OS/arch.

The macOS build ships as two separate dmg artifacts instead of one universal
dmg. Universal packaging would need both native-module architectures present
in one build and a reliable `lipo` path; separate runners keep native-module
verification honest.

## Signing

- **macOS**: `mac.identity: null` in `electron-builder.yml` explicitly skips
  signing rather than letting electron-builder pick up an unrelated cert
  from the local keychain. Real Developer ID signing + notarization is
  tracked separately (see SOU-214's deferred macOS section).
- **Windows**: Authenticode signing via **SSL.com eSigner** cloud signing,
  wired through a custom electron-builder sign hook. Unsigned until the CI
  secrets are set — see **Windows CI signing** below.

### Windows CI signing (SSL.com eSigner) — SOU-214

Windows installers are Authenticode-signed in the Package workflow when four
SSL.com eSigner secrets are present. Signing is delegated to a custom sign
hook (`apps/desktop/build/sign-windows.cjs`) wired via
`win.signtoolOptions.sign` in `electron-builder.yml`; the hook shells out to
SSL.com's `CodeSignTool`. Signing runs **during** the build so `latest.yml`
and the `.blockmap` are computed over the already-signed installer (signing
after the fact would invalidate the auto-update metadata).

**The hook self-guards.** With none of the `SSL_COM_*` env vars set it logs
and returns without signing, so `pnpm dist:win` on a developer machine and CI
runs without the secrets both produce an unsigned installer exactly as
before. When the secrets are present, any signing failure fails the build —
an unsigned installer is never published as if it were signed.

**To activate** (once the SSL.com account is provisioned), add these repo
Actions secrets:

| Secret | Value |
|---|---|
| `SSL_COM_USERNAME` | eSigner account username |
| `SSL_COM_PASSWORD` | eSigner account password |
| `SSL_COM_CREDENTIAL_ID` | signing credential ID from the eSigner dashboard |
| `SSL_COM_TOTP_SECRET` | eSigner automation TOTP secret (from **eSigner → Automate signing**) |

The next Package run (`publish: true`) then signs automatically — no code
change. Credentials are passed to CodeSignTool via the environment, never on
the command line. The pinned CodeSignTool version lives in `package.yml`
(`CODESIGNTOOL_VERSION`); verify/bump it against
<https://github.com/SSLcom/CodeSignTool/releases> when activating.

**Cert type caveat.** The chosen cert is SSL.com **Personal ID** (Individual
Validation), so the Authenticode publisher shown to users is the individual's
legal name, not "Centre Soutien". IV/OV do not clear SmartScreen on day one —
reputation accrues over downloads (only EV clears it immediately). Swapping to
an organization cert later changes the publisher name and can break the
electron-updater signature chain, so keep the identity chosen here.

**Signing budget.** electron-builder signs multiple PE files per release (the
app `.exe` plus the NSIS installer, sometimes the uninstaller) — budget ~2-3
signings per published release against the eSigner Tier 1 quota (20/month).

### Optional: self-signed dev certificate

To test the signed path locally (not required to build or demo), create your
own local cert and point electron-builder at it via env vars. This is a
system-keychain / certificate-store change — do it deliberately, on your own
machine, not via an automated script:

**macOS** (Keychain Access): Certificate Assistant → Create a Certificate →
name it e.g. "Centre Soutien Dev", Identity Type "Self Signed Root",
Certificate Type "Code Signing". Then:

```bash
CSC_NAME="Centre Soutien Dev" pnpm --filter @centresoutien/desktop dist:mac
```

On **Windows**, the custom sign hook (`win.signtoolOptions.sign`) now owns
signing, so the old `CSC_LINK` / `CSC_KEY_PASSWORD` self-signed `.pfx` path no
longer takes effect — electron-builder calls the hook instead, and with no
`SSL_COM_*` credentials the hook leaves the build unsigned. To exercise the
real signed path on Windows locally you need **both** the eSigner credentials
and CodeSignTool on disk (the hook shells out to it):

1. Download `CodeSignTool-<version>.zip` from
   <https://github.com/SSLcom/CodeSignTool/releases> and extract it.
2. Point the hook at the folder containing `CodeSignTool.bat` and set the four
   credentials (see **Windows CI signing** above), e.g. in Git Bash:

   ```bash
   export CODESIGNTOOL_DIR="/c/tools/CodeSignTool"
   export SSL_COM_USERNAME=... SSL_COM_PASSWORD=... \
          SSL_COM_CREDENTIAL_ID=... SSL_COM_TOTP_SECRET=...
   pnpm --filter @centresoutien/desktop dist:win
   ```

   With the credentials set but `CODESIGNTOOL_DIR` missing, the hook fails
   fast rather than producing an unsigned build.

A self-signed cert does **not** satisfy Gatekeeper or SmartScreen trust —
the workaround below is still required either way.

## Installing an unsigned / self-signed build (demo workaround)

**macOS — Gatekeeper** blocks unsigned/unnotarized apps with "cannot be
opened because Apple cannot check it for malicious software":
- Right-click the app → **Open** → **Open** in the confirmation dialog (only
  needed once), or
- **System Settings → Privacy & Security** → "Open Anyway", or
- `xattr -cr "Centre Soutien.app"` to strip the quarantine flag before first
  launch.

**Windows — SmartScreen** blocks unsigned/unknown-publisher installers with
"Windows protected your PC":
- Click **More info** → **Run anyway**.

Both are one-time per install and expected for demo-only distribution. This
is not viable for unattended/public distribution — that's exactly what the
deferred real cert purchase fixes.

## Native module unpacking

`better-sqlite3-multiple-ciphers` and `@node-rs/argon2*` are excluded from
the asar archive (`asarUnpack` in `electron-builder.yml`) — native `.node`
binaries can't be loaded from inside asar.

### `@node-rs/argon2`'s platform package must be a direct optionalDependency

`@node-rs/argon2` is a napi-rs package: its `index.js` picks the right
platform at runtime via `require('@node-rs/argon2-<platform>')`, a bare
specifier resolved by Node's normal module walk. Left as only a *transitive*
optionalDependency of `@node-rs/argon2`, pnpm places that platform package
several directories deep inside `@node-rs/argon2`'s own `.pnpm` store entry
— a symlink structure that doesn't reliably survive electron-builder's asar
packing. The failure mode is silent until first launch: packaging succeeds,
`electron-builder`'s own log even names the fix
("`platform-specific optional dependencies not bundled — add them to your
project's optionalDependencies`"), but the shipped app throws `Failed to
load native binding` on first use.

Fix: declare the platform packages we actually ship as **direct**
`optionalDependencies` of `apps/desktop/package.json` (currently
`@node-rs/argon2-darwin-arm64`, `@node-rs/argon2-darwin-x64`, and
`@node-rs/argon2-win32-x64-msvc`, matching the package workflow matrix). A
direct dependency gets pnpm's normal top-level hoisted symlink, which packs
correctly. If a new target arch/OS is added to `electron-builder.yml`, add its
matching `@node-rs/argon2-*` package here too.

The `Verify native modules load in packaged app` CI step exists because of
this exact bug: a green `electron-builder` exit code does not prove the
native modules it bundled actually load. It runs the packaged Electron
binary's own Node runtime headlessly (`ELECTRON_RUN_AS_NODE=1`, no window)
and requires both native modules through `app.asar` — **not**
`app.asar.unpacked` directly. The real app does `require('@node-rs/argon2')`
as a bare specifier from inside the packed asar; Node resolves that by
walking node_modules *inside the asar virtual filesystem*, and Electron
transparently redirects individual unpacked files as they're read. An
earlier version of this check required the unpacked path directly, which
skips that resolution walk and can pass even when the real launch require
chain is broken — it did, and this exact bug shipped past it once already.
Any future native dependency should get the same `app.asar`-path check.
