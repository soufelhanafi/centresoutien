import type { DesktopApi } from '../shared/ipc/api';

declare global {
  interface Window {
    readonly api: DesktopApi;
  }
}

export {};
