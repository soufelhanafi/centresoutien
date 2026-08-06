import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/App';
import i18n from '../../src/renderer/i18n/config';

// This smoke test drives a returning, already-activated user to the dashboard,
// so the license gate (SOU-104) must pass through. The activation screen's own
// behavior is covered where it's rendered directly, not here.
vi.mock('../../src/renderer/lib/license/license-api', () => ({
  licenseApi: {
    status: async () => ({
      status: 'active' as const,
      plan: 'essentiel' as const,
      restricted: false,
      expiresAt: null,
      centersAllowed: null,
      founderDiscountExpiresAt: null,
      founderDiscountExpired: false,
    }),
    activate: async () => ({ status: 'rejected' as const, reason: 'malformed' as const }),
  },
}));

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('App — i18n + runtime RTL', () => {
  it('renders French by default and sets dir=ltr on <html>', async () => {
    render(<App />);
    // The shell boots on the default route, so the page heading is the dashboard title.
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(document.documentElement.getAttribute('lang')).toBe('fr');
  });

  it('toggling to Arabic swaps the copy and flips dir=rtl live', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'العربية' }));

    expect(await screen.findByRole('heading', { name: 'لوحة القيادة' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
  });
});
