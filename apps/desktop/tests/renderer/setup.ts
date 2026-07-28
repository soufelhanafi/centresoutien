import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Stub the preload bridge so components that call it don't crash in jsdom.
Object.defineProperty(window, 'api', {
  configurable: true,
  writable: true,
  value: {
    invoke: async () => ({ reply: 'pong: test', appVersion: '0.0.0' }),
  },
});

afterEach(() => {
  cleanup();
});
