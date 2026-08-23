/**
 * Compile-time constant electron-vite's `define` replaces at build time
 * (electron.vite.config.ts) with the password-reset relay's origin (SOU-273).
 * Overridable via the `RELAY_BASE_URL` build env, defaulting to production
 * (`https://centresoutien.com`), so the shipped binary carries no hardcoded
 * relay literal in source.
 */
declare const __RELAY_BASE_URL__: string;
