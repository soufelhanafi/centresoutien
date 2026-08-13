/**
 * Test-only stand-in for the `electron` module (SOU-229).
 *
 * The `desktop` vitest project aliases `electron` to this file (vitest.workspace.ts)
 * so that importing a main-process module under test never loads the real npm
 * package. Real `electron` in a plain-Node test process resolves to the binary
 * path and, when that binary is absent, makes `@electron/get` fetch it from the
 * CDN — a network dependency that turned a runner hiccup into a red unit-test job.
 * These no-ops are never exercised: the main-process code that would call them is
 * driven through injected fakes in the tests, so only the named exports need to
 * exist for top-level `import { … } from 'electron'` to resolve.
 *
 * A test that needs bespoke behaviour still declares its own `vi.mock('electron', …)`,
 * which overrides this stub for that file.
 */
const noop = (): void => undefined;

export const app = {
  getPath: () => '',
  getName: () => 'centre-soutien-test',
  getVersion: () => '0.0.0-test',
  quit: noop,
  on: noop,
  whenReady: () => Promise.resolve(),
};

export const shell = {
  openExternal: () => Promise.resolve(),
  openPath: () => Promise.resolve(''),
  showItemInFolder: noop,
};

export const dialog = {
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
  showSaveDialog: () => Promise.resolve({ canceled: true, filePath: undefined }),
  showMessageBox: () => Promise.resolve({ response: 0 }),
};

export const ipcMain = {
  handle: noop,
  on: noop,
  removeHandler: noop,
};

export const ipcRenderer = {
  invoke: () => Promise.resolve(),
  send: noop,
  on: noop,
};

export const contextBridge = {
  exposeInMainWorld: noop,
};

export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: () => Buffer.from(''),
  decryptString: () => '',
};

export const BrowserWindow = class {
  static getAllWindows(): unknown[] {
    return [];
  }
  static fromWebContents(): unknown {
    return null;
  }
};

export default { app, shell, dialog, ipcMain, ipcRenderer, contextBridge, safeStorage, BrowserWindow };
