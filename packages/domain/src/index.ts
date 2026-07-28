/**
 * @centresoutien/domain — the portable core.
 *
 * Zero platform dependencies: no React, no Electron, no SQLite, no Node builtins.
 * This package is compiled with `lib: ["ES2022"]` (no DOM) and declares no
 * workspace dependencies, so the module graph cannot resolve `apps/*`.
 *
 * The sync-safe entity base (SOU-19) lands here next.
 */
export const DOMAIN_PACKAGE = '@centresoutien/domain' as const;
