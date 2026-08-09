import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Repo root — where the gitignored `.env` (and `.env.example`) live, so
// `loadEnv` reads them for every build target regardless of the invoking cwd.
const ENV_DIR = resolve(__dirname, '../..');

// Three build targets: main + preload (Node/Electron) and renderer (React web).
// externalizeDepsPlugin keeps node_modules (electron, the native SQLCipher
// module) out of the main/preload bundles.
//
// `--mode e2e` produces the dedicated E2E build: the only build where the
// compile-time constant `__CS_E2E__` is `true`, unlocking the license
// trust-anchor injection seam in the main process (see composition-root). Every
// other mode (`dev`, the default `build`) leaves it `false`, so the seam and its
// env reads are dead-code-eliminated from the shipped binary — the honest-user
// security baseline (CLAUDE.md §5quater) is preserved.
export default defineConfig(({ mode }) => {
  const isE2E = mode === 'e2e';
  // Demo credentials (SOU-186) are injected from the BUILD environment (or a
  // gitignored `.env`) into the MAIN bundle only — a packaged binary's sole
  // credential path, since the sales laptop has no shell env. Never in the
  // renderer bundle (it receives them at runtime via the `demo.status` IPC), and
  // never a source literal. Empty when the build env is unset → demo fails loud.
  const env = loadEnv(mode, ENV_DIR, '');
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        __CS_E2E__: JSON.stringify(isE2E),
        __CS_DEMO_USERNAME__: JSON.stringify(env['CS_DEMO_USERNAME'] ?? ''),
        __CS_DEMO_PASSWORD__: JSON.stringify(env['CS_DEMO_PASSWORD'] ?? ''),
      },
      // The E2E build adds a second, window-less main entry: the standalone bare
      // hub the multi-laptop sync spec (SOU-82) runs as its own process. It is
      // compiled ONLY here, so a release build ships just `index.js`.
      ...(isE2E
        ? {
            build: {
              rollupOptions: {
                input: {
                  index: resolve(__dirname, 'src/main/index.ts'),
                  'hub-standalone': resolve(__dirname, 'src/main/hub-standalone.ts'),
                },
                output: { entryFileNames: '[name].js' },
              },
            },
          }
        : {}),
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      // Sandboxed preloads must be CommonJS — ESM `import` is rejected at runtime.
      build: {
        rollupOptions: {
          output: { format: 'cjs', entryFileNames: '[name].js' },
        },
      },
    },
    renderer: {
      plugins: [react(), tailwindcss()],
      // @centresoutien/ui ships raw source, so its own `@ui/*` imports resolve here.
      resolve: {
        alias: { '@ui': resolve(__dirname, '../../packages/ui/src') },
      },
    },
  };
});
