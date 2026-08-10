/**
 * Compile-time demo-credential constants electron-vite's `define` replaces at
 * build time (electron.vite.config.ts), sourced from the BUILD environment via
 * `loadEnv` (`CS_DEMO_USERNAME` / `CS_DEMO_PASSWORD`). They are the only credential
 * path a packaged binary has — the sales laptop carries no shell env — and are the
 * empty string when the build environment left them unset, so demo mode fails loud
 * rather than shipping a literal. Runtime `process.env` still wins for dev / E2E.
 * Under vitest they are defined as `""` (see vitest.workspace.ts), never a global.
 */
declare const __CS_DEMO_USERNAME__: string;
declare const __CS_DEMO_PASSWORD__: string;
