import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUpgradeCta } from '../../src/renderer/hooks/use-upgrade-prompt';
import { useUpgradePromptStore } from '../../src/renderer/stores/upgrade-prompt-store';
import i18n from '../../src/renderer/i18n/config';

beforeEach(() => {
  useUpgradePromptStore.setState({ feature: null });
});

afterEach(async () => {
  await i18n.changeLanguage('fr');
});

describe('useUpgradeCta', () => {
  it('yields no handler for an ungated module (flag undefined)', () => {
    const { result } = renderHook(() => useUpgradeCta(undefined));
    expect(result.current.onCta).toBeUndefined();
    expect(result.current.ctaLabel).toBe('');
  });

  it('labels the CTA with the feature\'s intended plan (FR)', async () => {
    await i18n.changeLanguage('fr');
    const { result } = renderHook(() => useUpgradeCta('payroll.teacher'));
    expect(result.current.ctaLabel).toBe('Débloquer avec Pro');
  });

  it('names Premium for a premium-tier feature', async () => {
    await i18n.changeLanguage('fr');
    const { result } = renderHook(() => useUpgradeCta('dashboard.advanced'));
    expect(result.current.ctaLabel).toBe('Débloquer avec Premium');
  });

  it('translates the label in Arabic', async () => {
    await i18n.changeLanguage('ar');
    const { result } = renderHook(() => useUpgradeCta('payroll.teacher'));
    expect(result.current.ctaLabel).toBe('افتح مع برو');
  });

  it('opens the shared upgrade dialog for the feature when invoked', () => {
    const { result } = renderHook(() => useUpgradeCta('dashboard.advanced'));
    act(() => result.current.onCta?.());
    expect(useUpgradePromptStore.getState().feature).toBe('dashboard.advanced');
  });
});
