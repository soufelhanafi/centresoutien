# Packaging (SOU-86)

Scope locked in the SOU-86 KICKOFF comment: self-signed dev certs only,
controlled in-person demo installs. Real cert purchase, notarization with a
real Apple ID, and auto-update are separate follow-up tickets (the latter is
SOU-87).

## Building

```bash
pnpm --filter @centresoutien/desktop dist       # current platform's installer
pnpm --filter @centresoutien/desktop dist:mac   # dmg (must run on macOS)
pnpm --filter @centresoutien/desktop dist:win   # NSIS installer (must run on Windows)
```

`predist` rebuilds `better-sqlite3-multiple-ciphers` for the Electron ABI and
runs `electron-vite build` before electron-builder packages the app.

### Why each platform must build on its own OS

`better-sqlite3-multiple-ciphers` and `@node-rs/argon2` are native modules.
Their compiled `.node` binaries are only valid for the OS/arch that produced
them — there is no cross-compile step in this setup. Building `dist:win` on
macOS (or vice versa) would silently bundle the wrong binary and crash on
first database access. `dist` builds only for the host platform for this
reason; `.github/workflows/package.yml` runs a `macos-latest` / `windows-
latest` matrix (manual `workflow_dispatch`) so each installer is built on
its real target OS.

The macOS build is `arm64`-only for the same reason — the dev machine that
builds it only has an arm64 toolchain/native binaries installed. An `x64`
mac target can be added once it's actually needed (extra CI runner or a
configured `pnpm.supportedArchitectures` fetch — see `dependency not found
on disk` warnings in the electron-builder log for what's missing).

## Signing

No paid Developer ID / Windows code-signing cert exists yet — deferred to a
follow-up once the first client validates the demo (one cert then covers
every client; no per-client signing).

- **macOS**: `mac.identity: null` in `electron-builder.yml` explicitly skips
  signing rather than letting electron-builder pick up an unrelated cert
  from the local keychain.
- **Windows**: unsigned unless `CSC_LINK` / `CSC_KEY_PASSWORD` env vars are
  set (electron-builder's standard signing env vars — no config change
  needed to opt in).

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

**Windows** (PowerShell, run as the account that will sign):

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigning -Subject "CN=Centre Soutien Dev" -CertStoreLocation Cert:\CurrentUser\My
$pwd = ConvertTo-SecureString -String "changeit" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath dev-cert.pfx -Password $pwd
```

```bash
CSC_LINK=./dev-cert.pfx CSC_KEY_PASSWORD=changeit pnpm --filter @centresoutien/desktop dist:win
```

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
