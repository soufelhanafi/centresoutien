import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpgradeDialog } from '../../src/renderer/components/upgrade/upgrade-dialog';
import { useUpgradePromptStore } from '../../src/renderer/stores/upgrade-prompt-store';
import i18n from '../../src/renderer/i18n/config';

const openExternal = vi.fn();

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  useUpgradePromptStore.setState({ feature: null });
  openExternal.mockReset();
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { invoke: async () => ({}), external: { open: openExternal } },
  });
});

afterEach(() => {
  useUpgradePromptStore.setState({ feature: null });
});

describe('UpgradeDialog', () => {
  it('stays closed until a feature opens it', () => {
    render(<UpgradeDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the plan-specific benefit for the opened feature', () => {
    render(<UpgradeDialog />);
    act(() => useUpgradePromptStore.getState().open('dashboard.advanced'));
    expect(screen.getByText(i18n.t('upgrade.title'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('upgrade.benefit.premium'))).toBeInTheDocument();
  });

  it('opens the pricing page in the browser and closes on the primary CTA', async () => {
    const user = userEvent.setup();
    render(<UpgradeDialog />);
    act(() => useUpgradePromptStore.getState().open('payroll.teacher'));

    await user.click(screen.getByRole('button', { name: i18n.t('upgrade.viewPlans') }));

    expect(openExternal).toHaveBeenCalledWith('https://centresoutien.com/tarifs');
    expect(useUpgradePromptStore.getState().feature).toBeNull();
  });

  it('closes without navigating on "later"', async () => {
    const user = userEvent.setup();
    render(<UpgradeDialog />);
    act(() => useUpgradePromptStore.getState().open('payroll.teacher'));

    await user.click(screen.getByRole('button', { name: i18n.t('upgrade.later') }));

    expect(openExternal).not.toHaveBeenCalled();
    expect(useUpgradePromptStore.getState().feature).toBeNull();
  });
});
