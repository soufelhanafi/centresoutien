'use strict';

// SOU-214: custom Authenticode sign hook for electron-builder (Windows),
// backed by SSL.com eSigner cloud signing (CodeSignTool).
//
// Wired via `win.signtoolOptions.sign` in electron-builder.yml. electron-builder
// invokes this once per PE that needs signing (the app executable, then the
// NSIS installer / uninstaller) DURING the build, so `latest.yml` and the
// `.blockmap` are computed over the already-signed installer. Signing the
// artifacts after electron-builder finishes would invalidate that auto-update
// metadata (the sha512 in latest.yml would no longer match the installer).
//
// Each invocation is one eSigner "signing" against the account's monthly quota
// (Tier 1 = 20/month), so a published release costs ~2-3 signings.
//
// Self-guarding by design:
//   - No SSL.com eSigner credentials in the environment (local dev, or CI
//     without the secrets) -> logs and returns without signing, leaving the
//     build UNSIGNED exactly as it was before signing was introduced. This is
//     what keeps `pnpm dist:win` working on a developer machine.
//   - Credentials present -> any signing failure throws and fails the build,
//     so an unsigned installer can never be published as if it were signed.
//
// Credentials are passed to CodeSignTool via the environment (the same channel
// SSL.com's own esigner-codesign action uses) rather than on the command line,
// so no secret ever appears in a process argument list. Only the file path and
// `-override` are passed as arguments.

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const REQUIRED_ENV = ['SSL_COM_USERNAME', 'SSL_COM_PASSWORD', 'SSL_COM_CREDENTIAL_ID', 'SSL_COM_TOTP_SECRET'];

function readCredentials() {
  const present = REQUIRED_ENV.filter((name) => Boolean(process.env[name]));
  if (present.length === 0) {
    return null;
  }
  if (present.length !== REQUIRED_ENV.length) {
    const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
    throw new Error(`SSL.com eSigner signing is partially configured — missing: ${missing.join(', ')}`);
  }
  return {
    username: process.env.SSL_COM_USERNAME,
    password: process.env.SSL_COM_PASSWORD,
    credentialId: process.env.SSL_COM_CREDENTIAL_ID,
    totpSecret: process.env.SSL_COM_TOTP_SECRET,
  };
}

function resolveCodeSignTool() {
  const dir = process.env.CODESIGNTOOL_DIR;
  if (!dir) {
    throw new Error(
      'SSL.com eSigner credentials are set but CODESIGNTOOL_DIR is not — the "Set up SSL.com CodeSignTool" workflow step did not run.',
    );
  }
  const launcher = process.platform === 'win32' ? 'CodeSignTool.bat' : 'CodeSignTool.sh';
  return { dir, launcher: path.join(dir, launcher) };
}

function buildChildEnv(credentials) {
  // CodeSignTool reads these from the environment. USERNAME is also a built-in
  // Windows variable (the logon name), so it must be explicitly overridden with
  // the eSigner account username here.
  return {
    ...process.env,
    USERNAME: credentials.username,
    PASSWORD: credentials.password,
    CREDENTIAL_ID: credentials.credentialId,
    TOTP_SECRET: credentials.totpSecret,
  };
}

async function signWindows(configuration) {
  const credentials = readCredentials();
  const fileName = path.basename(configuration.path);

  if (!credentials) {
    console.warn(`[sign-windows] SSL.com eSigner credentials not set — leaving ${fileName} UNSIGNED.`);
    return;
  }

  const { dir, launcher } = resolveCodeSignTool();
  const args = ['sign', `-input_file_path=${configuration.path}`, '-override'];
  const childEnv = buildChildEnv(credentials);
  const isWindows = process.platform === 'win32';

  console.log(`[sign-windows] Signing ${fileName} via SSL.com eSigner…`);

  const result = isWindows
    ? spawnSync('cmd.exe', ['/c', launcher, ...args], { cwd: dir, stdio: 'inherit', env: childEnv })
    : spawnSync(launcher, args, { cwd: dir, stdio: 'inherit', env: childEnv });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`[sign-windows] CodeSignTool exited with code ${result.status} while signing ${fileName}`);
  }
}

module.exports = signWindows;
module.exports.default = signWindows;
