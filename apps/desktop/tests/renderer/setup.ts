import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom ships no ResizeObserver; some Radix primitives (e.g. Switch, Checkbox)
// construct one on mount. A no-op stub is enough for these DOM-only unit tests.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
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
        // A fresh center persists no hours; the settings form seeds its defaults.
        case 'centerHours.get':
          return { week: [] };
        // Default to a remembered device so App smoke tests render the app, not
        // the login screen. Auth-specific tests override `window.api.invoke`.
        case 'auth.session':
          return { authenticated: true };
        // Default to no saved profile so App smoke tests render the blank
        // Settings form. Center-specific tests override `window.api.invoke`.
        case 'center.get':
          return { center: null };
        // Zeroed KPI/widget summaries so App smoke tests can mount the dashboard
        // without a real backend. Dashboard-specific tests override this.
        case 'dashboard.basic':
          return { summary: { todaysSessionCount: 0, activeStudentCount: 0, unpaidInvoiceCount: 0 } };
        case 'dashboard.advanced':
          return {
            summary: {
              revenueTrend: [],
              enrollmentEvolution: [],
              attendanceRatePercent: 0,
              subjectRevenueBreakdown: [],
            },
          };
        default:
          return { reply: 'pong: test', appVersion: '0.0.0' };
      }
    },
  },
});

afterEach(() => {
  cleanup();
});
