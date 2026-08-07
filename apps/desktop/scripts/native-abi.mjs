/**
 * Ensure `better-sqlite3-multiple-ciphers` is built for the ABI of whichever
 * runtime is about to load it.
 *
 * The module is NAN-based, so its compiled `build/Release/better_sqlite3.node`
 * is ABI-specific: plain Node 22 needs NODE_MODULE_VERSION 127, Electron 43
 * needs 148. `bindings` loads that single file, so the two ABIs cannot coexist —
 * `dev` / `start` / `test:e2e` run under Electron and need the 148 build; vitest
 * runs under Node and needs the 127 build. Upstream ships a Node prebuild but no
 * Electron one, so the Electron direction compiles from source (needs a working
 * C++ toolchain) while the Node direction is a fast prebuild download.
 *
 * We probe the current build first and only switch when it's wrong, so a warm
 * tree is a no-op — no needless recompiles, no clobbering the build the other
 * runtime just set up.
 *
 * Usage: node native-abi.mjs <electron|node>
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const target = process.argv[2];
if (target !== 'electron' && target !== 'node') {
  throw new Error(`native-abi: expected "electron" or "node", got ${target ?? '(nothing)'}`);
}

const require = createRequire(import.meta.url);
const moduleDir = dirname(require.resolve('better-sqlite3-multiple-ciphers/package.json'));
const binary = join(moduleDir, 'build', 'Release', 'better_sqlite3.node');

/** ABI the current build/Release targets, as seen from this (Node) process. */
function currentAbi() {
  try {
    // This script runs under Node: a clean load means it's the Node ABI.
    process.dlopen({ exports: {} }, binary);
    return 'node';
  } catch (err) {
    // An ABI mismatch means it's built for another (Electron) ABI; anything else
    // (e.g. the file is missing) means there's no usable build yet.
    return /NODE_MODULE_VERSION/.test(String(err?.message)) ? 'electron' : 'missing';
  }
}

if (currentAbi() === target) {
  console.log(`native module already built for ${target} ABI — skipping rebuild`);
} else if (target === 'electron') {
  // Compiles from source (no Electron prebuild published). rebuild:native is the
  // single home of the electron-rebuild invocation.
  // shell: true — on Windows, pnpm resolves to a pnpm.cmd shim that plain
  // execFileSync can't spawn (ENOENT); the shell handles that resolution.
  execFileSync('pnpm', ['run', 'rebuild:native'], { stdio: 'inherit', shell: true });
} else {
  // Fast: fetches the published Node prebuild (cached), no compiler required.
  const prebuildInstall = require.resolve('prebuild-install/bin.js', { paths: [moduleDir] });
  execFileSync(process.execPath, [prebuildInstall], { cwd: moduleDir, stdio: 'inherit' });
}
