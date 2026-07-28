import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Three build targets: main + preload (Node/Electron) and renderer (web).
// externalizeDepsPlugin keeps node_modules (electron, the native SQLCipher
// module) out of the main/preload bundles.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {},
});
