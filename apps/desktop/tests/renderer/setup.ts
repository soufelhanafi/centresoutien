import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom ships no ResizeObserver; some Radix primitives (e.g. Switch) construct
// one on mount. A no-op stub is enough for these DOM-only unit tests.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// Stub the preload bridge so components that call it don't crash in jsdom.
Object.defineProperty(window, 'api', {
  configurable: true,
  writable: true,
  value: {
    invoke: async (channel: string) => {
      switch (channel) {
        case 'plan.get':
          return { planId: 'essentiel' };
        // Default to a returning user so App smoke tests render the app, not the
        // first-run wizard. Wizard-specific tests override `window.api.invoke`.
        case 'admin.exists':
          return { exists: true };
        // A fresh center persists no hours; the settings form seeds its defaults.
        case 'centerHours.get':
          return { week: [] };
        default:
          return { reply: 'pong: test', appVersion: '0.0.0' };
      }
    },
  },
});

afterEach(() => {
  cleanup();
});
