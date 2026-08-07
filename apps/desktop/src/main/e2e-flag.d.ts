/**
 * Compile-time flag electron-vite's `define` replaces at build time
 * (electron.vite.config.ts). `true` ONLY in the dedicated E2E build
 * (`electron-vite build --mode e2e`); `false` in every dev and release build,
 * so any branch guarded by it is dead-code-eliminated from the shipped binary.
 * See the license trust-anchor seam in `composition-root.ts`.
 */
declare const __CS_E2E__: boolean;
