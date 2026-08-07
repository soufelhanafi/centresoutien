import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: { __CS_E2E__: JSON.stringify(isE2E) },
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
