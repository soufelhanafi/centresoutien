import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no ResizeObserver; some Radix primitives (e.g. Checkbox) require it.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom leaves matchMedia undefined; sonner's <Toaster /> reads prefers-color-scheme.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

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
        // Default to a remembered device so App smoke tests render the app, not
        // the login screen. Auth-specific tests override `window.api.invoke`.
        case 'auth.session':
          return { authenticated: true };
        // Default to no saved profile so App smoke tests render the blank
        // Settings form. Center-specific tests override `window.api.invoke`.
        case 'center.get':
          return { center: null };
        default:
          return { reply: 'pong: test', appVersion: '0.0.0' };
      }
    },
  },
});

afterEach(() => {
  cleanup();
});
