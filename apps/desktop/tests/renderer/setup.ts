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
        // the login screen. `role: 'owner'` so assistant-visibility gating
        // (useUserPermission) doesn't hide anything for the default fixture —
        // an owner always sees every screen. Auth-specific and
        // assistant-visibility-specific tests override `window.api.invoke`.
        case 'auth.session':
          return { authenticated: true, role: 'owner', permissions: [] };
        // Default to no saved profile so App smoke tests render the blank
        // Settings form. Center-specific tests override `window.api.invoke`.
        case 'center.get':
          return { center: null };
        // Zeroed KPI/widget summaries so App smoke tests can mount the dashboard
        // without a real backend. Dashboard-specific tests override this.
        case 'dashboard.basic':
          return {
            summary: {
              argent: {
                month: '2026-07',
                billedMad: 0,
                collectedMad: 0,
                unpaidMad: 0,
                paidInvoices: { paidCount: 0, totalCount: 0 },
                prevMonth: { billedMad: 0, collectedMad: 0, unpaidMad: 0 },
                deltas: {
                  billed: { deltaPercent: null },
                  collected: { deltaPercent: null },
                },
              },
              effectifs: {
                activeStudentCount: 0,
                groupCount: 0,
                averageStudentsPerGroup: 0,
                unenrolledStudentCount: 0,
                groupBars: [],
              },
              teacherWeeklyLoad: [],
              seances: {
                weekStart: '2026-07-06',
                weekSessionCount: 0,
                plannedMinutes: 0,
                groupsWithoutSessions: [],
              },
            },
          };
        // Zeroed day takings so the dashboard Argent block (SOU-223) mounts its
        // `useTodayTakings` reader without a real backend. Takings-specific tests
        // override `window.api.invoke`.
        case 'payment.takings':
          return { netMad: 0, paymentCount: 0, byMethod: { cash: 0, cheque: 0, transfer: 0, other: 0 } };
        case 'dashboard.advanced':
          return {
            summary: {
              revenueTrend: [],
              enrollmentEvolution: [],
              attendanceRatePercent: 0,
              subjectRevenueBreakdown: [],
              enrollmentActivity: [],
              attendanceHeatmap: [],
            },
          };
        default:
          return { reply: 'pong: test', appVersion: '0.0.0' };
      }
    },
    // Stub the preload push/command channels for the updater (SOU-87) so
    // <App> mounts without crashing; useAppUpdate() subscribes on mount and
    // needs a callable disposer for its effect cleanup.
    onUpdateStatus: () => () => {},
    restartNow: () => {},
    // Stub the join-progress push channel (45-minute-onboarding follow-up) so
    // JoinProgressStep mounts without crashing; it subscribes on mount and
    // needs a callable disposer for its effect cleanup. Join-flow-specific
    // tests override `window.api.onJoinProgress` to assert on live updates.
    onJoinProgress: () => () => {},
  },
});

afterEach(() => {
  cleanup();
});
